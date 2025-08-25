import React, { useState, useEffect, useRef } from 'react';
import './BlogManager.css';
import { blogAPI } from '../services/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const BlogManager = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Welcome to Blog Manager! You can:\n• Generate blog posts: 'Write a blog about AI'\n• Upload posts: 'Upload from ./my_posts'\n• List pending posts: 'Show me pending posts'",
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString(),
      operationType: 'info'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [blogPosts, setBlogPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [previewMode, setPreviewMode] = useState('raw'); // 'raw' or 'preview'
  const [isGeneratingPost, setIsGeneratingPost] = useState(false); // Track post generation
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState({ progress: 0, message: '' });
  const [currentStream, setCurrentStream] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load blog posts on component mount
  useEffect(() => {
    loadBlogPosts();
  }, []);

  const loadBlogPosts = async () => {
    try {
      const response = await blogAPI.listBlogPosts();
      setBlogPosts(response.posts || []);
    } catch (error) {
      console.error('Error loading blog posts:', error);
    }
  };

  const pollForNewPosts = async (attempt = 0, maxAttempts = 10) => {
    try {
      const currentPostCount = blogPosts.length;
      const response = await blogAPI.listBlogPosts();
      const newPosts = response.posts || [];
      
      // Check if new posts were added
      if (newPosts.length > currentPostCount) {
        setBlogPosts(newPosts);
        console.log('✅ New blog posts detected and loaded');
        return;
      }
      
      // If no new posts and haven't reached max attempts, try again
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 5000); // Exponential backoff, max 5s
        console.log(`⏳ Polling for new posts (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms`);
        setTimeout(() => pollForNewPosts(attempt + 1, maxAttempts), delay);
      } else {
        console.log('⚠️ Max polling attempts reached, forcing refresh');
        setBlogPosts(newPosts);
      }
    } catch (error) {
      console.error('Error polling for new posts:', error);
      // Fallback to regular load after a delay
      setTimeout(() => loadBlogPosts(), 2000);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isStreaming) return;

    const userMessage = {
      id: Date.now(),
      text: inputText.trim(),
      sender: 'user',
      timestamp: new Date().toLocaleTimeString()
    };

    const messageText = inputText.trim();
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsStreaming(true);
    setStreamProgress({ progress: 0, message: 'Starting blog operation...' });

    // Check if this is a generate post request
    const isGenerateRequest = messageText.toLowerCase().includes('generate') || 
                             messageText.toLowerCase().includes('write') || 
                             messageText.toLowerCase().includes('create');
    
    if (isGenerateRequest) {
      setIsGeneratingPost(true);
    }

    // Use streaming for better user experience
    const stream = blogAPI.streamBlogRequest(messageText, sessionId, {
      onProgress: (data) => {
        setStreamProgress({
          progress: data.progress || 0,
          message: data.message || 'Processing...'
        });
        
        // Store session ID if provided
        if (data.session_id && !sessionId) {
          setSessionId(data.session_id);
        }
      },
      
      onData: (data) => {
        // Store session ID if provided
        if (data.session_id && !sessionId) {
          setSessionId(data.session_id);
        }

        // Handle both direct message and data object
        let responseData = data.data || data;
        
        const botMessage = {
          id: Date.now() + 1,
          text: responseData.message || data.message,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString(),
          operationType: responseData.operation_performed || data.operation_performed,
          filesCreated: responseData.files_created || data.files_created
        };

        setMessages(prev => [...prev, botMessage]);

        // Reload blog posts if a new post was generated
        if (responseData.operation_performed === 'generate_post' || responseData.files_created) {
          // Poll for new posts with exponential backoff
          pollForNewPosts();
        }
      },
      
      onComplete: (data) => {
        setIsStreaming(false);
        setStreamProgress({ progress: 100, message: 'Blog operation complete' });
        setCurrentStream(null);
        setIsGeneratingPost(false);
        
        // Clear progress after a short delay
        setTimeout(() => {
          setStreamProgress({ progress: 0, message: '' });
        }, 1000);
      },
      
      onError: (error) => {
        console.error('Blog streaming error:', error);
        setIsStreaming(false);
        setCurrentStream(null);
        setIsGeneratingPost(false);
        
        const errorMessage = {
          id: Date.now() + 1,
          text: `Error: ${error.message}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        };

        setMessages(prev => [...prev, errorMessage]);
        
        // Clear progress
        setStreamProgress({ progress: 0, message: '' });
      }
    });

    setCurrentStream(stream);
  };

  const cancelStream = () => {
    if (currentStream) {
      currentStream.cancel();
      setCurrentStream(null);
      setIsStreaming(false);
      setIsGeneratingPost(false);
      setStreamProgress({ progress: 0, message: '' });
    }
  };

  const handlePostClick = async (post) => {
    try {
      // Use directory name instead of filename for the new API
      const directoryName = post.directory ? post.directory.split('/').pop() : post.filename;
      const postContent = await blogAPI.getBlogPost(directoryName);
      setSelectedPost(postContent);
      setShowPostModal(true);
      setPreviewMode('raw'); // Reset to raw mode when opening new post
    } catch (error) {
      console.error('Error loading post content:', error);
      alert(`Failed to load post: ${error.message}`);
    }
  };

  const renderMarkdown = (content) => {
    if (!content) return '';
    const rawHtml = marked(content);
    return DOMPurify.sanitize(rawHtml);
  };

  const togglePreviewMode = () => {
    setPreviewMode(previewMode === 'raw' ? 'preview' : 'raw');
  };

  const clearBlogSession = () => {
    setMessages([
      {
        id: 1,
        text: "Welcome to Blog Manager! You can:\n• Generate blog posts: 'Write a blog about AI'\n• Upload posts: 'Upload from ./my_posts'\n• List pending posts: 'Show me pending posts'",
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString(),
        operationType: 'info'
      }
    ]);
    setSessionId(null);
  };

  const getOperationIcon = (operationType) => {
    switch (operationType) {
      case 'generate_post': return '✍️';
      case 'upload_post': return '📤';
      case 'list_pending_posts': return '📋';
      case 'info': return 'ℹ️';
      default: return '🤖';
    }
  };

  return (
    <div className="blog-manager-container">
      <div className="blog-content">
        {/* Left Panel - Chat Interface */}
        <div className="blog-chat-panel">
          <div className="blog-chat-header">
            <h3>Blog Operations</h3>
            <button onClick={clearBlogSession} className="clear-btn" title="Clear session">
              🗑️
            </button>
          </div>

          <div className="blog-messages-container">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.sender}`}>
                <div className={`message-bubble ${message.isError ? 'error' : ''}`}>
                  {message.sender === 'bot' && (
                    <span className="operation-icon">
                      {getOperationIcon(message.operationType)}
                    </span>
                  )}
                  <div className="message-content">
                    <p style={{ whiteSpace: 'pre-line' }}>{message.text}</p>
                    {message.filesCreated && (
                      <div className="files-created">
                        <strong>Files created:</strong>
                        <ul>
                          {message.filesCreated.map((file, index) => (
                            <li key={index}>{file}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <span className="timestamp">{message.timestamp}</span>
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="message bot">
                <div className="message-bubble loading">
                  {isStreaming ? (
                    <div className="streaming-progress">
                      <div className="progress-info">
                        <span className="progress-text">{streamProgress.message}</span>
                        <span className="progress-percent">{Math.round(streamProgress.progress * 100)}%</span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${streamProgress.progress * 100}%` }}
                        ></div>
                      </div>
                      <button 
                        onClick={cancelStream} 
                        className="cancel-stream-btn"
                        title="Cancel blog operation"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="blog-input-form">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your blog request... (e.g., 'Generate a blog about React')"
              className="blog-message-input"
              disabled={isStreaming}
            />
            <button 
              type="submit" 
              className="send-btn"
              disabled={!inputText.trim() || isStreaming}
            >
              {isStreaming ? '⏳' : '➤'}
            </button>
          </form>
        </div>

        {/* Right Panel - Blog Posts List */}
        <div className="blog-posts-panel">
          <div className="blog-posts-header">
            <h3>Blog Posts ({blogPosts.length})</h3>
            <div className="header-actions">
              {(isGeneratingPost || isStreaming) && (
                <span className="generating-indicator" title="Processing blog operation...">
                  {isStreaming ? `⏳ ${streamProgress.message}` : '⏳ Generating...'}
                </span>
              )}
              <button onClick={loadBlogPosts} className="refresh-btn" title="Refresh posts">
                🔄
              </button>
            </div>
          </div>

          <div className="blog-posts-list">
            {blogPosts.length === 0 ? (
              <div className="no-posts">
                <p>No blog posts yet.</p>
                <p>Generate your first post by typing something like:</p>
                <code>"Write a blog about machine learning"</code>
              </div>
            ) : (
              blogPosts.map((post, index) => (
                <div key={index} className="blog-post-item" onClick={() => handlePostClick(post)}>
                  <div className="post-title">{post.title}</div>
                  <div className="post-meta">
                    <span className="post-filename">{post.filename || 'markdown.md'}</span>
                    <span className="post-size">{(post.size / 1024).toFixed(1)}KB</span>
                    <span className={`post-status ${post.upload_status}`}>
                      {post.upload_status === 'uploaded' ? '✅' : '⏳'}
                    </span>
                  </div>
                  <div className="post-date">
                    {new Date(post.created * 1000).toLocaleString()}
                  </div>
                  {post.has_featured_image && (
                    <div className="post-features">
                      <span className="feature-badge">🖼️ Image</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Post Content Modal */}
      {showPostModal && selectedPost && (
        <div className="post-modal-overlay" onClick={() => setShowPostModal(false)}>
          <div className="post-modal" onClick={(e) => e.stopPropagation()}>
            <div className="post-modal-header">
              <h3>{selectedPost.title}</h3>
              <div className="modal-actions">
                <button 
                  onClick={togglePreviewMode} 
                  className={`preview-toggle-btn ${previewMode}`}
                  title={previewMode === 'raw' ? 'Show Preview' : 'Show Raw'}
                >
                  {previewMode === 'raw' ? '👁️ Preview' : '📝 Raw'}
                </button>
                <button onClick={() => setShowPostModal(false)} className="modal-close-btn">
                  ✕
                </button>
              </div>
            </div>
            <div className="post-modal-meta">
              <span>{selectedPost.directory || selectedPost.filename}</span>
              <span>{(selectedPost.size / 1024).toFixed(1)}KB</span>
              <span>{new Date(selectedPost.created * 1000).toLocaleString()}</span>
              <span className={`post-status ${selectedPost.upload_status}`}>
                {selectedPost.upload_status === 'uploaded' ? '✅ Uploaded' : '⏳ Pending'}
              </span>
              {selectedPost.has_featured_image && <span>🖼️ Featured Image</span>}
            </div>
            <div className="post-modal-content">
              {previewMode === 'raw' ? (
                <pre className="raw-content">{selectedPost.content}</pre>
              ) : (
                <div 
                  className="markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedPost.content) }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogManager;