import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "becktotheend")

client = AsyncIOMotorClient(MONGO_URI)


def get_db():
    return client[MONGO_DB]
