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
            cleaned_str = re.sub(r'//.*', '', input_data)
            data = json.loads(cleaned_str)
            
            # Check if it's wrapped in a response object
            if 'response' in data:
                response_str = data['response']
                cleaned_response = re.sub(r'//.*', '', response_str)
                inner_json = json.loads(cleaned_response)
                collection = inner_json['collection']
                pipeline = inner_json['pipeline']
            else:
                # Direct pipeline object
                collection = data['collection']
                pipeline = data['pipeline']
        else:
            # input_data is already a dict
            if 'response' in input_data:
                response_str = input_data['response']
                cleaned_response = re.sub(r'//.*', '', response_str)
                inner_json = json.loads(cleaned_response)
                collection = inner_json['collection']
                pipeline = inner_json['pipeline']
            else:
                collection = input_data['collection']
                pipeline = input_data['pipeline']
        
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

input_data = '{\n    "collection": "projectActivities",\n    "pipeline": [\n        // Stage 1: Match activities for the dasf project using project_id\n        {\n            "$match": {\n                "project_id": "68e8814c1d3bf309607d7a09"\n            }\n        },\n        // Stage 2: Project only relevant activity fields\n        {\n            "$project": {\n                "_id": 1,\n                "subject": 1,\n                "type": 1,\n                "description": 1,\n                "status": 1,\n                "priority": 1,\n                "assignee": 1,\n                "approver": 1,\n                "due_date": 1,\n                "start_date": 1,\n                "end_date": 1,\n                "progress": 1,\n                "estimated_time": 1,\n                "spent_time": 1,\n                "created_at": 1,\n                "updated_at": 1\n            }\n        },\n        // Stage 3: Sort activities by start_date ascending\n        {\n            "$sort": {\n                "start_date": 1\n            }\n        }\n    ]\n}'

mongo_url = os.getenv('MONGO_URL') or 'localhost:8801'
mongo_db_name = os.getenv('MONGO_DB') or 'giap'

collection, pipeline = parse_pipeline_from_input(input_data)

if collection and pipeline:
    result_documents = fetch_aggregation_results(collection, pipeline, mongo_url, mongo_db_name)
else:
    result_documents = []

print(result_documents)