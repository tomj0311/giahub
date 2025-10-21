import os
import json
import re
from pymongo import MongoClient
from pymongo.errors import PyMongoError


def parse_pipeline_from_input(input_data):
    try:
        # If input_data is a string, it might be wrapped in a response object or be the direct pipeline
        if isinstance(input_data, str):
            # Remove JavaScript-style comments first
            data = json.loads(input_data)

            # Direct pipeline object
            collection = data['collection']
            pipeline = data['pipeline']
        else:
            raise ValueError("Input data must be a JSON string")
        
        return collection, pipeline
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        return None, None
    except KeyError as e:
        print(f"Missing key in JSON: {e}")
        return None, None

def fetch_aggregation_results(collection, pipeline, mongo_url, mongo_db_name):
    client = MongoClient(mongo_url)
    db = client[mongo_db_name]
    documents = []
    try:
        results = db[collection].aggregate(pipeline)
        documents = list(results)
    except PyMongoError as e:
        print(f"MongoDB error: {e}")
        documents = []
    finally:
        client.close()
    return documents

input_data = '{ "collection": "projects", "pipeline": [ { "$match": { "name": { "$regex": "^dasf$", "$options": "i" } } }, { "$addFields": { "project_id_str": { "$toString": "$_id" } } }, { "$lookup": { "from": "projectActivities", "localField": "project_id_str", "foreignField": "project_id", "as": "activities" } }, { "$unwind": { "path": "$activities", "preserveNullAndEmptyArrays": false } }, { "$replaceRoot": { "newRoot": "$activities" } }, { "$sort": { "created_at": -1 } } ] }'

mongo_url = os.getenv('MONGO_URL') or 'localhost:8801'
mongo_db_name = os.getenv('MONGO_DB') or 'giap'

collection, pipeline = parse_pipeline_from_input(input_data)

if collection and pipeline:
    result_documents = fetch_aggregation_results(collection, pipeline, mongo_url, mongo_db_name)
else:
    result_documents = []

print(result_documents)