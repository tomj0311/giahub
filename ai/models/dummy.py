"""
Dummy Model - Simplified interface
"""
from ai.model.dummy_model import DummyEchoModel


class Dummy(DummyEchoModel):
    """
    Simplified Dummy model interface.
    This is a wrapper around DummyEchoModel for testing purposes.
    """
    
    def __init__(
        self,
        # Core parameters
        id: str = "dummy-echo",
        name: str = "DummyEcho",
        **kwargs
    ):
        super().__init__(
            id=id,
            name=name,
            **kwargs
        )
