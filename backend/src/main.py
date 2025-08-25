from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
import logging
import uuid
import json
import re

from langchain.schema import HumanMessage
from langgraph.checkpoint.memory import MemorySaver

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import both chat graph
try:
    from .graph import create_graph
    from .blog.graph_for_blog import create_blog_graph
except ImportError:
    from graph import create_graph
    from blog.graph_for_blog import create_blog_graph

# Create graphs with memory
chat_memory = MemorySaver()
chat_graph = create_graph(chat_memory)

app = FastAPI(title="My AI Agent API", description="LangGraph-powered AI agent service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str
    session_id: str = None  # Optional session ID for conversation continuity


class ChatResponse(BaseModel):
    """Chat response model."""
    message: str
    session_id: str
    status: str = "success"


class StreamEvent(BaseModel):
    """Stream event model for SSE responses."""
    type: str  # progress, data, error, complete
    step: Optional[str] = None
    progress: Optional[float] = None
    message: Optional[str] = None
    data: Optional[dict] = None
    session_id: Optional[str] = None


@app.get("/")
def read_index():
    """Health check endpoint."""
    return {"message": "My AI Agent API is running", "status": "healthy"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint with memory persistence."""
    try:
        logger.info(f"Received chat request: {request.message}")
        
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # Create thread configuration for checkpointer
        config = {"configurable": {"thread_id": session_id}}
        
        # Run the chat graph with memory
        result = chat_graph.invoke(
            {"messages": [HumanMessage(content=request.message)]},
            config=config
        )
        
        # Extract the AI response
        ai_response = result["messages"][-1].content
        
        logger.info(f"Successfully generated chat response for session: {session_id}")
        return ChatResponse(message=ai_response, session_id=session_id)
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


async def chat_stream_generator(message: str, session_id: str) -> AsyncGenerator[str, None]:
    """Generate streaming chat responses using Server-Sent Events."""
    try:
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Send initial progress
        yield f"data: {json.dumps({'type': 'progress', 'step': 'initializing', 'progress': 0.0, 'message': 'Starting chat processing...', 'session_id': session_id})}\n\n"
        
        # Create thread configuration for checkpointer
        config = {"configurable": {"thread_id": session_id}}
        
        # Send progress update
        yield f"data: {json.dumps({'type': 'progress', 'step': 'processing', 'progress': 0.3, 'message': 'Connecting to AI model...', 'session_id': session_id})}\n\n"
        
        # Stream the chat graph execution
        step_count = 0
        
        async for chunk in chat_graph.astream(
            {"messages": [HumanMessage(content=message)]},
            config=config
        ):
            step_count += 1
            progress = min(0.3 + step_count * 0.3, 0.9)
            
            for node_name, node_output in chunk.items():
                yield f"data: {json.dumps({'type': 'progress', 'step': node_name, 'progress': progress, 'message': f'Processing step: {node_name}', 'session_id': session_id})}\n\n"
                
                # If this is the final response
                if node_name == "chat" and "messages" in node_output:
                    ai_response = node_output["messages"][-1].content
                    yield f"data: {json.dumps({'type': 'data', 'message': ai_response, 'session_id': session_id})}\n\n"
        
        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'progress': 1.0, 'message': 'Chat processing complete', 'session_id': session_id})}\n\n"
        
    except Exception as e:
        logger.error(f"Error in chat stream: {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'message': f'Chat processing failed: {str(e)}', 'session_id': session_id})}\n\n"


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint using Server-Sent Events."""
    session_id = request.session_id or str(uuid.uuid4())
    return StreamingResponse(
        chat_stream_generator(request.message, session_id),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )


# Create graphs with memory
blog_memory = MemorySaver()
blog_graph = create_blog_graph(checkpointer=blog_memory)


class BlogRequest(BaseModel):
    """Blog request model."""
    message: str
    session_id: Optional[str] = None  # Optional session ID for conversation continuity
    operation_type: Optional[str] = None  # Optional hint: "generate", "upload", "list"


class BlogResponse(BaseModel):
    """Blog response model."""
    message: str
    session_id: str
    operation_performed: Optional[str] = None
    files_created: Optional[List[str]] = None
    status: str = "success"


@app.post("/blog", response_model=BlogResponse)
async def blog_management(request: BlogRequest):
    """Blog management endpoint for generating, uploading, and listing posts."""
    try:
        logger.info(f"Received blog request: {request.message}")
        
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # Create thread configuration for checkpointer
        config = {"configurable": {"thread_id": session_id}}
        
        # Run the blog graph with memory
        result = blog_graph.invoke(
            {"messages": [HumanMessage(content=request.message)]},
            config=config
        )
        
        # Extract the AI response and additional info
        ai_response = result["messages"][-1].content
        operation_performed = result.get("decision", "unknown")
        
        # Check if any files were created (for generate_post operation)
        files_created = None
        if operation_performed == "generate_post" and "saved" in ai_response.lower():
            # Extract filename from response if possible
            import re
            file_match = re.search(r"to ([\w\/\.\-_]+\.md)", ai_response)
            if file_match:
                files_created = [file_match.group(1)]
        
        logger.info(f"Successfully completed blog operation: {operation_performed}")
        return BlogResponse(
            message=ai_response, 
            session_id=session_id,
            operation_performed=operation_performed,
            files_created=files_created
        )
        
    except Exception as e:
        logger.error(f"Error in blog endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Blog operation failed: {str(e)}")


async def blog_stream_generator(message: str, session_id: str) -> AsyncGenerator[str, None]:
    """Generate streaming blog responses using Server-Sent Events."""
    try:
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Send initial progress
        yield f"data: {json.dumps({'type': 'progress', 'step': 'initializing', 'progress': 0.0, 'message': 'Starting blog operation...', 'session_id': session_id})}\n\n"
        
        # Create thread configuration for checkpointer
        config = {"configurable": {"thread_id": session_id}}
        
        # Send progress update
        yield f"data: {json.dumps({'type': 'progress', 'step': 'routing', 'progress': 0.1, 'message': 'Analyzing request type...', 'session_id': session_id})}\n\n"
        
        # Stream the blog graph execution
        step_count = 0
        final_message = ""
        final_decision = "unknown"
        
        async for chunk in blog_graph.astream(
            {"messages": [HumanMessage(content=message)]},
            config=config
        ):
            step_count += 1
            progress = min(0.1 + step_count * 0.1, 0.9)
            
            for node_name, node_output in chunk.items():
                yield f"data: {json.dumps({'type': 'progress', 'step': node_name, 'progress': progress, 'session_id': session_id})}\n\n"
                
                # Store final result data
                if "messages" in node_output and node_output["messages"]:
                    final_message = node_output["messages"][-1].content
                
                if "decision" in node_output:
                    final_decision = node_output["decision"]
        
        # Send final data
        final_data = {
            'message': final_message,
            'operation_performed': final_decision
        }
        
        yield f"data: {json.dumps({'type': 'data', 'data': final_data, 'session_id': session_id})}\n\n"
        
        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'progress': 1.0, 'message': f'Blog operation complete: {final_decision}', 'session_id': session_id})}\n\n"
        
    except Exception as e:
        logger.error(f"Error in blog stream: {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'message': f'Blog operation failed: {str(e)}', 'session_id': session_id})}\n\n"


@app.post("/blog/stream")
async def blog_stream(request: BlogRequest):
    """Streaming blog endpoint using Server-Sent Events."""
    session_id = request.session_id or str(uuid.uuid4())
    return StreamingResponse(
        blog_stream_generator(request.message, session_id),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )


@app.get("/blog/posts")
async def list_blog_posts():
    # """List all generated blog posts using WordPress utility format."""
    try:
        posts = []
        return {"posts": posts[:20]}
        
    except Exception as e:
        logger.error(f"Error listing blog posts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list posts: {str(e)}")


@app.get("/blog/posts/{directory_name}")
async def get_blog_post(directory_name: str):
    """Get content of a specific blog post by directory name."""
    try:
        return ""
    
    except Exception as e:
        logger.error(f"Error reading blog post: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to read post: {str(e)}")


@app.get("/health")
def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "service": "My AI Agent",
        "chat_graph_compiled": chat_graph is not None,
        "blog_graph_compiled": blog_graph is not None,
    }


# Direct run without uvicorn
if __name__ == "__main__":
    try:
        print("🚀 Starting My AI Agent server...")
        print(f"📍 Server will be available at: http://localhost:8887")
        print(f"📋 API docs available at: http://localhost:8887/docs")
        print(f"🤖 Chat graph compiled: {chat_graph is not None}")
        print(f"🤖 Blog graph compiled: {blog_graph is not None}")
        
        import uvicorn
        print("🔄 Starting server...")
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=8887, 
            reload=False,
            log_level="info"
        )
        print("🛑 Server stopped")
    except Exception as e:
        print(f"❌ Error starting server: {str(e)}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")
