"""
My AI Agent using LangGraph and Google Gemini.

Features: General conversation, Q&A, helpful assistant.
Flow: START → chat_node → END
"""

import logging
from typing import TypedDict
from typing_extensions import Annotated

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain.schema import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages


# Setup logging and load environment
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()


class State(TypedDict):
    """AI Agent conversation state."""
    messages: Annotated[list[HumanMessage | AIMessage], add_messages]  # Conversation history


# Initialize LLM
llm = init_chat_model("google_genai:gemini-2.5-flash", max_tokens=10000)


def chat_node(state: State):
    """Processes user messages and generates AI responses."""
    try:
        logger.info("Processing chat message")
        
        # Generate response using conversational AI
        response = llm.invoke([
            SystemMessage(
                content="""You are a helpful, friendly AI assistant. 
                
Guidelines:
- Be conversational and engaging
- Provide accurate, helpful information
- Ask clarifying questions when needed
- Keep responses concise but informative
- Be respectful and professional
- Admit when you don't know something"""
            )
        ] + state["messages"])
        
        logger.info("Generated chat response")
        return {"messages": [response]}
        
    except Exception as e:
        logger.error(f"Error in chat_node: {str(e)}")
        return {
            "messages": [AIMessage(content="Sorry, I encountered an error processing your message. Please try again.")]
        }


def create_graph(checkpointer=None):
    """Create chat graph with optional checkpointer for memory."""
    graph_builder = (
        StateGraph(State)
        .add_node("chat", chat_node)
        .add_edge(START, "chat")
        .add_edge("chat", END)
    )
    
    if checkpointer:
        return graph_builder.compile(checkpointer=checkpointer)
    else:
        return graph_builder.compile()


# Create simple chat graph without memory (for backward compatibility)
graph = create_graph()

__all__ = ["graph", "create_graph"]