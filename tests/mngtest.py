import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

# Load .env file from the same directory as this script
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

def get_env_variable(var_name, default=None):
    value = os.getenv(var_name)
    if value is None:
        if default is not None:
            return default
        raise EnvironmentError(f"Missing environment variable: {var_name}")
    return value

def parse_pipeline_from_input(input_data):
    try:
        # input_data is already a dict, no need to parse it
        response_str = input_data['response']
        cleaned_str = re.sub(r'//.*', '', response_str)
        inner_json = json.loads(cleaned_str)
        collection = inner_json['collection']
        pipeline = inner_json['pipeline']
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

input_data = { "response": "{\n \"collection\": \"Projects\",\n \"pipeline\": [\n // Stage 1: Find the project named \"Test\"\n {\n \"$match\": {\n \"name\": \"Test\"\n }\n },\n // Stage 2: Project only the _id field (get project _id for lookup)\n {\n \"$project\": {\n \"_id\": 1\n }\n },\n // Stage 3: Lookup activities for this project from projectActivities collection\n {\n \"$lookup\": {\n \"from\": \"projectActivities\",\n \"localField\": \"_id\",\n \"foreignField\": \"project_id\",\n \"as\": \"activities\"\n }\n },\n // Stage 4: Unwind activities array to have one document per activity\n {\n \"$unwind\": {\n \"path\": \"$activities\",\n \"preserveNullAndEmptyArrays\": false\n }\n },\n // Stage 5: Replace root document with the activity document (list only activities)\n {\n \"$replaceRoot\": { \"newRoot\": \"$activities\" }\n },\n // Stage 6: Sort activities by due_date ascending\n {\n \"$sort\": {\n \"due_date\": 1\n }\n }\n ]\n}", "timestamp": "2025-10-21T03:11:48.556775+00:00" } #GLobal context variable 

mongo_url = get_env_variable('MONGO_URL')
mongo_db_name = get_env_variable('MONGO_DB')

collection, pipeline = parse_pipeline_from_input(input_data)

if collection and pipeline:
    result_documents = fetch_aggregation_results(collection, pipeline, mongo_url, mongo_db_name)
else:
    result_documents = []

print(result_documents)