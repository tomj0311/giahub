# Updated Naming Conventions for Knowledge Collections

## Changes Made

Based on your requirements, I've updated the naming conventions for both vector database collections and MinIO storage paths.

## Vector Database Collections

**Previous Naming**: `knowledge_{tenant_id}_{collection}`
**New Naming**: `{collection_name}_{user_id}`

**Examples**:
- Collection "documents" for user "user123" → `documents_user123`
- Collection "research_papers" for user "john_doe" → `research_papers_john_doe`

**Benefits**:
- Simpler naming structure
- User-specific isolation
- More intuitive collection names

## MinIO Storage Paths

**Structure**: `uploads/{tenant_id}/{user_id}/{collection_name}/files`
**Bucket**: `hcp` (default, configurable via `MINIO_BUCKET` env var)

**Examples**:
- Tenant "acme", User "user123", Collection "documents" → `uploads/acme/user123/documents/`
- Files stored as: `uploads/acme/user123/documents/1693747200000-filename.pdf`

**Benefits**:
- Clear hierarchical structure
- Tenant and user isolation
- Easy to manage and backup
- Supports multi-tenancy

## Code Changes Made

### 1. Vector Database Functions
- `_initialize_vector_collection()`: Updated to use `{collection}_{user_id}` naming
- `_delete_vector_collection()`: Updated to match new naming convention
- `_index_file_to_vector_db()`: Updated collection naming and added user_id parameter

### 2. API Endpoints
- `delete_collection()`: Added user_id parameter for vector collection deletion
- `upload_knowledge_files()`: Updated to pass user_id to indexing function

### 3. Configuration
- MinIO and Qdrant port configurations already correct (8803 and 8805)
- Bucket name remains "hcp" but path structure ensures proper isolation

## File Structure Example

```
MinIO Bucket: hcp
├── uploads/
│   ├── tenant_abc/
│   │   ├── user_123/
│   │   │   ├── documents/
│   │   │   │   ├── 1693747200000-report.pdf
│   │   │   │   └── 1693747300000-notes.txt
│   │   │   └── research/
│   │   │       ├── 1693747400000-paper1.pdf
│   │   │       └── 1693747500000-paper2.pdf
│   │   └── user_456/
│   │       └── documents/
│   │           └── 1693747600000-memo.docx
│   └── tenant_xyz/
│       └── user_789/
│           └── legal_docs/
│               └── 1693747700000-contract.pdf
```

## Vector Collections Example

```
Qdrant Collections:
- documents_user_123    (for user 123's documents collection)
- research_user_123     (for user 123's research collection)
- documents_user_456    (for user 456's documents collection)
- legal_docs_user_789   (for user 789's legal_docs collection)
```

## Benefits of New Naming

1. **User Isolation**: Each user has their own vector collections
2. **Simplified Management**: Easier to identify and manage collections
3. **Scalability**: Clear separation allows for better resource management
4. **Security**: User-specific collections prevent cross-user data access
5. **Maintainability**: Intuitive naming makes debugging easier

## Migration Notes

If you have existing collections using the old naming convention, you would need to:
1. Create new collections with the new naming format
2. Migrate existing vector data
3. Update any references to use the new naming

The updated implementation is backward compatible for MinIO paths but vector collections will use the new naming format going forward.
