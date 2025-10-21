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

input_data = { "response": "{\n \"collection\": \"projects\",\n \"pipeline\": [\n // Match the project 'dasf' by name\n {\n \"$match\": {\n \"name\": \"dasf\"\n }\n },\n // Lookup all activities from projectActivities where project_id == _id (as string)\n {\n \"$lookup\": {\n \"from\": \"projectActivities\",\n \"localField\": \"_id\",\n \"foreignField\": \"project_id\",\n \"as\": \"activities\"\n }\n },\n // Handle case where project_id in activities is a string (convert _id to string)\n {\n \"$addFields\": {\n \"idAsString\": { \"$toString\": \"$_id\" }\n }\n },\n // Re-lookup using string id to cover project_id stored as string\n {\n \"$lookup\": {\n \"from\": \"projectActivities\",\n \"let\": { \"projIdStr\": \"$idAsString\" },\n \"pipeline\": [\n {\n \"$match\": {\n \"$expr\": { \"$eq\": [\"$project_id\", \"$$projIdStr\"] }\n }\n }\n ],\n \"as\": \"activities_str\"\n }\n },\n // Merge results from both lookups, remove duplicates\n {\n \"$addFields\": {\n \"allActivities\": {\n \"$setUnion\": [\n \"$activities\",\n \"$activities_str\"\n ]\n }\n }\n },\n // Unwind activities into flat records (one doc per activity)\n {\n \"$unwind\": {\n \"path\": \"$allActivities\",\n \"preserveNullAndEmptyArrays\": false\n }\n },\n // Project desired activity fields plus project reference\n {\n \"$project\": {\n \"_id\": 0,\n \"project_id\": \"$_id\",\n \"project_name\": \"$name\",\n \"activity_id\": \"$allActivities._id\",\n \"activity_subject\": \"$allActivities.subject\",\n \"activity_type\": \"$allActivities.type\",\n \"activity_description\": \"$allActivities.description\",\n \"activity_status\": \"$allActivities.status\",\n \"activity_priority\": \"$allActivities.priority\",\n \"activity_assignee\": \"$allActivities.assignee\",\n \"activity_approver\": \"$allActivities.approver\",\n \"activity_due_date\": \"$allActivities.due_date\",\n \"activity_start_date\": \"$allActivities.start_date\",\n \"activity_end_date\": \"$allActivities.end_date\",\n \"activity_progress\": \"$allActivities.progress\",\n \"activity_estimated_time\": \"$allActivities.estimated_time\",\n \"activity_spent_time\": \"$allActivities.spent_time\",\n \"activity_created_at\": \"$allActivities.created_at\",\n \"activity_updated_at\": \"$allActivities.updated_at\"\n }\n },\n // Sort by activity created_at ascending\n {\n \"$sort\": {\n \"activity_created_at\": 1\n }\n }\n ]\n}", "timestamp": "2025-10-21T04:45:57.146331+00:00" }


mongo_url = get_env_variable('MONGO_URL')
mongo_db_name = get_env_variable('MONGO_DB')

collection, pipeline = parse_pipeline_from_input(input_data)

if collection and pipeline:
    result_documents = fetch_aggregation_results(collection, pipeline, mongo_url, mongo_db_name)
else:
    result_documents = []

print(result_documents)