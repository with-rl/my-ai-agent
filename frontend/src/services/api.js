import axios from 'axios';

// API base configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8887';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 seconds timeout for blog operations
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('❌ Response Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

// Chat API functions
export const chatAPI = {
  /**
   * Send a message to the AI agent
   * @param {string} message - The user's message
   * @param {string|null} sessionId - Optional session ID for conversation continuity
   * @returns {Promise} Response with AI message and session ID
   */
  async sendMessage(message, sessionId = null) {
    try {
      const payload = {
        message: message.trim()
      };

      // Add session ID if provided
      if (sessionId) {
        payload.session_id = sessionId;
      }

      const response = await apiClient.post('/chat', payload);
      return response.data;
    } catch (error) {
      // Handle different error scenarios
      if (error.response) {
        // Server responded with error status
        throw new Error(error.response.data?.detail || 'Server error occurred');
      } else if (error.request) {
        // Request made but no response received
        throw new Error('Unable to connect to AI agent. Please check your connection.');
      } else {
        // Something else happened
        throw new Error('An unexpected error occurred');
      }
    }
  },

  /**
   * Check API health status
   * @returns {Promise} Health status response
   */
  async checkHealth() {
    try {
      const response = await apiClient.get('/health');
      return response.data;
    } catch (error) {
      throw new Error('Health check failed');
    }
  },

  /**
   * Get basic API info
   * @returns {Promise} Basic API information
   */
  async getInfo() {
    try {
      const response = await apiClient.get('/');
      return response.data;
    } catch (error) {
      throw new Error('Failed to get API info');
    }
  },

  /**
   * Stream chat messages using Server-Sent Events
   * @param {string} message - The user's message
   * @param {string|null} sessionId - Optional session ID for conversation continuity
   * @param {function} onProgress - Callback for progress updates
   * @param {function} onData - Callback for data updates
   * @param {function} onComplete - Callback for completion
   * @param {function} onError - Callback for errors
   * @returns {EventSource} EventSource instance for manual control
   */
  streamMessage(message, sessionId = null, { onProgress, onData, onComplete, onError }) {
    const payload = {
      message: message.trim(),
      ...(sessionId && { session_id: sessionId })
    };

    // Since EventSource doesn't support POST directly, we'll use fetch with stream reading
    return this.createStreamConnection('/chat/stream', payload, { onProgress, onData, onComplete, onError });
  },

  /**
   * Create a streaming connection using fetch and ReadableStream with retry logic
   */
  async createStreamConnection(endpoint, payload, { onProgress, onData, onComplete, onError }, retryCount = 0) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      const stream = {
        reader,
        cancelled: false,
        cancel() {
          this.cancelled = true;
          reader.cancel();
        }
      };

      // Process the stream
      const processStream = async () => {
        try {
          while (!stream.cancelled) {
            const { done, value } = await reader.read();
            
            if (done) {
              onComplete && onComplete();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  switch (data.type) {
                    case 'progress':
                      onProgress && onProgress(data);
                      break;
                    case 'data':
                      onData && onData(data);
                      break;
                    case 'complete':
                      onComplete && onComplete(data);
                      return;
                    case 'error':
                      onError && onError(new Error(data.message));
                      return;
                    default:
                      console.warn('Unknown SSE event type:', data.type);
                      break;
                  }
                } catch (parseError) {
                  console.warn('Failed to parse SSE data:', line);
                }
              }
            }
          }
        } catch (error) {
          if (!stream.cancelled) {
            // Check if this is a stream interruption that might be recoverable
            if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
              console.warn('Stream interrupted, attempting to reconnect...');
              onError && onError(new Error('Connection interrupted. Please try again.'));
            } else {
              onError && onError(error);
            }
          }
        }
      };

      processStream();
      return stream;

    } catch (error) {
      // Retry logic for network errors
      const maxRetries = 3;
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
      
      if (retryCount < maxRetries && this.shouldRetry(error)) {
        console.warn(`Stream connection failed, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Send retry progress update
        onProgress && onProgress({
          type: 'progress',
          progress: 0,
          message: `Connection failed, retrying in ${Math.ceil(retryDelay / 1000)}s...`
        });
        
        // Wait and retry
        setTimeout(() => {
          this.createStreamConnection(endpoint, payload, { onProgress, onData, onComplete, onError }, retryCount + 1);
        }, retryDelay);
        
        return {
          cancel: () => {
            console.log('Retry cancelled');
          }
        };
      } else {
        // Max retries reached or non-retryable error
        const errorMessage = retryCount >= maxRetries 
          ? `Connection failed after ${maxRetries} attempts. Please check your network connection.`
          : error.message;
          
        onError && onError(new Error(errorMessage));
        return { cancel: () => {} };
      }
    }
  },

  /**
   * Determine if an error should trigger a retry
   */
  shouldRetry(error) {
    // Retry for network errors, timeouts, and 5xx server errors
    return (
      !error.response || // Network error (no response)
      error.code === 'ECONNABORTED' || // Timeout
      (error.response && error.response.status >= 500) // Server error
    );
  }
};

export default apiClient;