import os
import sys
from pathlib import Path
from .utils import format_output
from ..models import User

__all__ = ['run', 'setup']

MAX_SIZE = 1024
API_KEY = "secret"


async def run(args):
    """Main entry point."""
    return True


def setup(config):
    pass


class Manager:
    def __init__(self):
        self.items = []
