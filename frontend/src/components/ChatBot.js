import React, { useState, useEffect, useRef } from 'react';
import './ChatBot.css';
import { chatAPI } from '../services/api';

const ChatBot = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI assistant. How can I help you today?",
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState({ progress: 0, message: '' });
  const [currentStream, setCurrentStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connected'); // connected, connecting, disconnected
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Filter messages based on search query
  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = messages.filter(message =>
        message.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        message.timestamp.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMessages(filtered);
    } else {
      setFilteredMessages([]);
    }
  }, [searchQuery, messages]);

  const handleSearchToggle = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery('');
      setFilteredMessages([]);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setFilteredMessages([]);
  };

  const highlightSearchTerm = (text, term) => {
    if (!term) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
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
    setStreamProgress({ progress: 0, message: 'Starting...' });
    setConnectionStatus('connecting');

    // Use streaming for better user experience
    const stream = chatAPI.streamMessage(messageText, sessionId, {
      onProgress: (data) => {
        setConnectionStatus('connected');
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

        const botMessage = {
          id: Date.now() + 1,
          text: data.message,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString()
        };

        setMessages(prev => [...prev, botMessage]);
      },
      
      onComplete: (data) => {
        setIsStreaming(false);
        setStreamProgress({ progress: 100, message: 'Complete' });
        setCurrentStream(null);
        
        // Clear progress after a short delay
        setTimeout(() => {
          setStreamProgress({ progress: 0, message: '' });
        }, 1000);
      },
      
      onError: (error) => {
        console.error('Streaming error:', error);
        setIsStreaming(false);
        setCurrentStream(null);
        setConnectionStatus('disconnected');
        
        let errorText = "Sorry, I'm having trouble connecting. Please try again.";
        
        // Provide more specific error messages
        if (error.message.includes('retry')) {
          errorText = error.message;
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorText = "Network connection failed. Please check your internet connection and try again.";
        }
        
        const errorMessage = {
          id: Date.now() + 1,
          text: errorText,
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
      setStreamProgress({ progress: 0, message: '' });
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 1,
        text: "Hello! I'm your AI assistant. How can I help you today?",
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
    setSessionId(null);
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-header">
        <div className="header-title">
          <h3>Chat with AI Agent</h3>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-indicator"></span>
            <span className="status-text">
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'disconnected' && 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={handleSearchToggle} className="search-btn" title="Search messages">
            🔍
          </button>
          <button onClick={clearChat} className="clear-btn" title="Clear conversation">
            🗑️
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="search-input"
            autoFocus
          />
          {searchQuery && (
            <button onClick={clearSearch} className="search-clear-btn" title="Clear search">
              ✕
            </button>
          )}
          <div className="search-results-info">
            {searchQuery && (
              <span>
                {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>
        </div>
      )}

      <div className="messages-container">
        {searchQuery ? (
          filteredMessages.length > 0 ? (
            filteredMessages.map((message) => (
              <div key={message.id} className={`message ${message.sender} search-result`}>
                <div className={`message-bubble ${message.isError ? 'error' : ''}`}>
                  <p dangerouslySetInnerHTML={{
                    __html: highlightSearchTerm(message.text, searchQuery)
                  }}></p>
                  <span className="timestamp">{message.timestamp}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="no-search-results">
              <p>No messages found matching "{searchQuery}"</p>
            </div>
          )
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`message ${message.sender}`}>
              <div className={`message-bubble ${message.isError ? 'error' : ''}`}>
                <p>{message.text}</p>
                <span className="timestamp">{message.timestamp}</span>
              </div>
            </div>
          ))
        )}
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
                    title="Cancel request"
                  >
                    ✕
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

      <form onSubmit={handleSendMessage} className="input-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your message here..."
          className="message-input"
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
  );
};

export default ChatBot;