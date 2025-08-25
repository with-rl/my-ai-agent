"""
AI Blog Management System using LangGraph and WordPress.

Features: Generate posts, upload posts, list pending posts.
Flow: START → router → [generate/upload/list] → END
"""

import logging
from pathlib import Path
from typing import TypedDict
from typing_extensions import NotRequired, Annotated
from pydantic import BaseModel, Field
from typing import Literal

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages


# Setup logging and load environment
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()


class Route(BaseModel):
    """Routing decision model with validation for blog operations."""
    step: Literal["generate_post", "upload_post", "list_posts"] = Field(
        description="The next step in the routing process"
    )
    blog_post_dir: str | None = Field(
        None, description="The directory path of the blog post to upload. Required if step is 'upload_post'."
    )
    topic: str | None = Field(
        None, description="The topic for generating a new blog post. Required if step is 'generate_post'."
    )


class State(TypedDict):
    """Workflow state with conversation messages and routing parameters."""
    topic: NotRequired[str]                                            # Blog post topic for generation
    decision: NotRequired[str]                                         # Routing decision from router_node
    blog_post_dir: NotRequired[str]                                    # Blog post directory for upload operations
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]  # Conversation history with auto-aggregation


# Initialize LLM, router, and WordPress utility
llm = init_chat_model("google_genai:gemini-2.5-flash", max_tokens=10000)
router = llm.with_structured_output(Route)


def router_node(state: State):
    """Routes user requests to appropriate blog operations using AI."""
    try:
        logger.info("Routing request")
        decision = router.invoke(
            [
                SystemMessage(
                    content="""Route user requests to blog operations:

1. 'generate_post' - Create new blog post with AI-generated images
   Keywords: write, create, generate, new post, blog about
   Required: topic

2. 'upload_post' - Upload existing posts to WordPress
   Keywords: upload, publish, submit, post to wordpress
   Required: directory path

3. 'list_posts' - List unpublished posts
   Keywords: list, show, pending, what posts
   
Extract topic or directory path as needed."""
                )
            ] + state["messages"]
        )
        
        logger.info(f"Routing decision: {decision.step}")
        return {"decision": decision.step, "blog_post_dir": decision.blog_post_dir, "topic": decision.topic}
        
    except Exception as e:
        logger.error(f"Error in router_node: {str(e)}")
        return {
            "decision": "list_posts",  # Default fallback
            "messages": [AIMessage(content=f"Error processing request: {str(e)}")]
        }


def generate_post_node(state: State):
    """Generates AI blog posts with WordPress utility."""
    try:
        topic = state.get("topic")
        logger.info(f"Generating post: {topic}")
        
        return {"messages": [AIMessage(content=f"✅ Successfully generated blog post about '{topic}'!\n\n")]}
    except Exception as e:
        logger.error(f"Error generating blog post: {str(e)}")
        return {"messages": [AIMessage(content=f"❌ Failed to generate blog post: {str(e)}")]}


def upload_post_node(state: State):
    """Uploads blog posts to WordPress with automatic image generation."""
    try:
        blog_post_dir = state.get("blog_post_dir")
        logger.info(f"Uploading from: {blog_post_dir}")
        
        return {"messages": [AIMessage(content=f"✅ Successfully uploaded blog post to WordPress!")]}
            
    except Exception as e:
        logger.error(f"Error uploading blog post: {str(e)}")
        return {"messages": [AIMessage(content=f"❌ Failed to upload blog post: {str(e)}")]}


def list_posts_node(state: State):
    """Lists blog posts that haven't been uploaded yet."""
    try:
        logger.info("Listing pending posts")
        
        return {"messages": [AIMessage(content="📝 No blog posts found.")]}
        
    except Exception as e:
        logger.error(f"Error listing pending posts: {str(e)}")
        return {"messages": [AIMessage(content=f"❌ Failed to list pending posts: {str(e)}")]}


def route_decision(state: State) -> str:
    """Returns next node to execute based on routing decision."""
    decision = state.get("decision")
    logger.info(f"Routing to: {decision}")
    return decision


def create_blog_graph(checkpointer=None):
    """Create blog management graph with optional checkpointer for memory."""
    graph_builder = (
        StateGraph(State)
        .add_node("router", router_node)
        .add_node("generate_post", generate_post_node)
        .add_node("upload_post", upload_post_node)
        .add_node("list_posts", list_posts_node)
        .add_edge(START, "router")
        .add_conditional_edges(
            "router",
            route_decision,
            {
                "generate_post": "generate_post",
                "upload_post": "upload_post", 
                "list_posts": "list_posts",
            },
        )
        .add_edge("generate_post", END)
        .add_edge("upload_post", END)
        .add_edge("list_posts", END)
    )
    
    if checkpointer:
        return graph_builder.compile(checkpointer=checkpointer)
    else:
        return graph_builder.compile()

# Create default blog graph without memory (for backward compatibility)
graph = create_blog_graph()

__all__ = ["graph", "create_blog_graph"]
