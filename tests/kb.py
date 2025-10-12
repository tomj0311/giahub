
import sys
import os
import types
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ai.vectordb.qdrant import Qdrant
from qdrant_client import QdrantClient

# Create a direct client connection to list collections
client = QdrantClient(
    host="localhost",
    port=8805,
)

def list_all_collections_and_documents():
    """List all collections and documents inside each collection in the Qdrant database."""
    print("=== Qdrant Database Contents ===\n")
    
    try:
        # Get all collections
        collections = client.get_collections()
        print(f"Found {len(collections.collections)} collection(s):\n")
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        for collection_info in collections.collections:
            collection_name = collection_info.name
            print(f"📁 Collection: {collection_name}")
            
            try:
                # Get collection info
                collection_details = client.get_collection(collection_name)
                print(f"   Vector size: {collection_details.config.params.vectors.size}")
                print(f"   Distance metric: {collection_details.config.params.vectors.distance}")
                
                # Get document count
                count_result = client.count(collection_name=collection_name, exact=True)
                print(f"   Total documents: {count_result.count}")
                
                if count_result.count > 0:
                    print("   📄 Documents:")
                    
                    # Scroll through all documents in the collection
                    offset = None
                    page_size = 100
                    doc_counter = 0
                    
                    while True:
                        scroll_result = client.scroll(
                            collection_name=collection_name,
                            limit=page_size,
                            offset=offset,
                            with_payload=True,
                            with_vectors=False
                        )
                        
                        points, next_offset = scroll_result
                        
                        if not points:
                            break
                        
                        for point in points:
                            doc_counter += 1
                            payload = point.payload or {}
                            name = payload.get('name', 'Unknown')
                            meta_data = payload.get('meta_data', {})
                            content_preview = payload.get('content', '')[:100] + "..." if payload.get('content') else "No content"
                            
                            print(f"      {doc_counter}. Name: {name}")
                            print(f"         ID: {point.id}")
                            if meta_data:
                                print(f"         Metadata: {meta_data}")
                            print(f"         Content preview: {content_preview}")
                            print()
                        
                        offset = next_offset
                        if offset is None:
                            break
                
                else:
                    print("   No documents found in this collection.")
                
            except Exception as e:
                print(f"   ❌ Error accessing collection '{collection_name}': {e}")
            
            print("-" * 50)
        
    except Exception as e:
        print(f"❌ Error connecting to Qdrant database: {e}")
        print("Make sure Qdrant is running on the configured port")

def delete_collection_by_number():
    """Delete a collection by selecting its number from the list."""
    try:
        # Get all collections
        collections = client.get_collections()
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        print("=== Available Collections ===")
        for i, collection_info in enumerate(collections.collections, 1):
            collection_name = collection_info.name
            count_result = client.count(collection_name=collection_name, exact=True)
            print(f"{i}. {collection_name} ({count_result.count} documents)")
        
        print("\nEnter the number of the collection to delete (or 0 to cancel):")
        try:
            choice = int(input("Choice: "))
            if choice == 0:
                print("Operation cancelled.")
                return
            
            if 1 <= choice <= len(collections.collections):
                collection_to_delete = collections.collections[choice - 1].name
                
                # Confirm deletion
                print(f"\n⚠️  Are you sure you want to delete collection '{collection_to_delete}'?")
                confirm = input("Type 'yes' to confirm: ").lower().strip()
                
                if confirm == 'yes':
                    client.delete_collection(collection_to_delete)
                    print(f"✅ Collection '{collection_to_delete}' has been deleted successfully.")
                else:
                    print("Deletion cancelled.")
            else:
                print("Invalid choice. Please enter a valid number.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error deleting collection: {e}")

def list_documents_by_name():
    """List documents by name in a selected collection."""
    try:
        # Get all collections
        collections = client.get_collections()
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        print("=== Available Collections ===")
        for i, collection_info in enumerate(collections.collections, 1):
            collection_name = collection_info.name
            count_result = client.count(collection_name=collection_name, exact=True)
            print(f"{i}. {collection_name} ({count_result.count} documents)")
        
        print("\nEnter the number of the collection to search (or 0 to cancel):")
        try:
            choice = int(input("Choice: "))
            if choice == 0:
                print("Operation cancelled.")
                return
            
            if 1 <= choice <= len(collections.collections):
                selected_collection = collections.collections[choice - 1].name
                search_documents_by_name(selected_collection)
            else:
                print("Invalid choice. Please enter a valid number.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error accessing collections: {e}")

def search_documents_by_name(collection_name):
    """Search for documents by name in a specific collection."""
    try:
        count_result = client.count(collection_name=collection_name, exact=True)
        
        if count_result.count == 0:
            print(f"No documents found in collection '{collection_name}'.")
            return
        
        print(f"\n=== Search Documents in Collection: {collection_name} ===")
        print("Choose search option:")
        print("1. Search by exact name")
        print("2. Search by partial name (contains)")
        print("3. List all documents sorted by name")
        print("4. List unique document names")
        print("0. Cancel")
        
        try:
            option = int(input("Choice: "))
            
            if option == 0:
                print("Operation cancelled.")
                return
            elif option == 1:
                search_exact_name(collection_name)
            elif option == 2:
                search_partial_name(collection_name)
            elif option == 3:
                list_all_documents_sorted(collection_name)
            elif option == 4:
                list_unique_names(collection_name)
            else:
                print("Invalid choice.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error searching documents in collection '{collection_name}': {e}")

def search_exact_name(collection_name):
    """Search for documents with exact name match."""
    try:
        name_to_search = input("Enter the exact document name to search for: ").strip()
        
        if not name_to_search:
            print("No name provided.")
            return
        
        print(f"\nSearching for documents with exact name: '{name_to_search}'...")
        
        # Use scroll with filter for exact name match
        scroll_result = client.scroll(
            collection_name=collection_name,
            scroll_filter={
                "must": [
                    {
                        "key": "name",
                        "match": {"value": name_to_search}
                    }
                ]
            },
            limit=100,
            with_payload=True,
            with_vectors=False
        )
        
        points, _ = scroll_result
        
        if not points:
            print(f"No documents found with exact name '{name_to_search}'.")
            return
        
        print(f"Found {len(points)} document(s) with exact name '{name_to_search}':")
        print("-" * 60)
        
        for i, point in enumerate(points, 1):
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            meta_data = payload.get('meta_data', {})
            content_preview = payload.get('content', '')[:200] + "..." if payload.get('content') else "No content"
            
            print(f"{i}. Document ID: {point.id}")
            print(f"   Name: {name}")
            if meta_data:
                print(f"   Metadata: {meta_data}")
            print(f"   Content preview: {content_preview}")
            print("-" * 60)
            
    except Exception as e:
        print(f"❌ Error searching for exact name: {e}")

def search_partial_name(collection_name):
    """Search for documents with partial name match."""
    try:
        partial_name = input("Enter partial document name to search for: ").strip().lower()
        
        if not partial_name:
            print("No name provided.")
            return
        
        print(f"\nSearching for documents containing: '{partial_name}'...")
        
        # Get all documents and filter locally (since Qdrant doesn't support partial text search in filters)
        documents = []
        offset = None
        page_size = 100
        
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
            
            documents.extend(points)
            offset = next_offset
            if offset is None:
                break
        
        # Filter documents by partial name match
        matching_docs = []
        for point in documents:
            payload = point.payload or {}
            name = payload.get('name', '').lower()
            if partial_name in name:
                matching_docs.append(point)
        
        if not matching_docs:
            print(f"No documents found containing '{partial_name}' in their name.")
            return
        
        print(f"Found {len(matching_docs)} document(s) containing '{partial_name}':")
        print("-" * 60)
        
        for i, point in enumerate(matching_docs, 1):
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            meta_data = payload.get('meta_data', {})
            content_preview = payload.get('content', '')[:200] + "..." if payload.get('content') else "No content"
            
            print(f"{i}. Document ID: {point.id}")
            print(f"   Name: {name}")
            if meta_data:
                print(f"   Metadata: {meta_data}")
            print(f"   Content preview: {content_preview}")
            print("-" * 60)
            
    except Exception as e:
        print(f"❌ Error searching for partial name: {e}")

def list_all_documents_sorted(collection_name):
    """List all documents in the collection sorted by name."""
    try:
        print(f"\nRetrieving all documents from collection '{collection_name}'...")
        
        # Get all documents
        documents = []
        offset = None
        page_size = 100
        
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
            
            documents.extend(points)
            offset = next_offset
            if offset is None:
                break
        
        # Sort documents by name
        documents.sort(key=lambda x: (x.payload or {}).get('name', '').lower())
        
        print(f"All {len(documents)} documents sorted by name:")
        print("=" * 80)
        
        for i, point in enumerate(documents, 1):
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            meta_data = payload.get('meta_data', {})
            content_preview = payload.get('content', '')[:150] + "..." if payload.get('content') else "No content"
            
            print(f"{i:3d}. Name: {name}")
            print(f"     ID: {point.id}")
            if meta_data:
                print(f"     Metadata: {meta_data}")
            print(f"     Content: {content_preview}")
            print("-" * 80)
            
    except Exception as e:
        print(f"❌ Error listing documents: {e}")

def list_unique_names(collection_name):
    """List unique document names in the collection with detailed grouping."""
    try:
        print(f"\nRetrieving unique document names from collection '{collection_name}'...")
        
        # Get all documents
        documents = []
        offset = None
        page_size = 100
        
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
            
            documents.extend(points)
            offset = next_offset
            if offset is None:
                break
        
        # Group documents by name
        name_groups = {}
        for point in documents:
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            if name not in name_groups:
                name_groups[name] = []
            name_groups[name].append(point)
        
        # Sort names alphabetically
        sorted_names = sorted(name_groups.keys(), key=str.lower)
        
        print(f"Found {len(sorted_names)} unique document names:")
        print("=" * 80)
        
        for i, name in enumerate(sorted_names, 1):
            documents_with_name = name_groups[name]
            count = len(documents_with_name)
            print(f"{i:3d}. {name} ({count} document{'s' if count > 1 else ''})")
            
            # Show details for each document with this name
            for j, point in enumerate(documents_with_name, 1):
                payload = point.payload or {}
                meta_data = payload.get('meta_data', {})
                content_preview = payload.get('content', '')[:100] + "..." if payload.get('content') else "No content"
                
                print(f"     └── Document {j}: ID={point.id}")
                if meta_data:
                    print(f"         Metadata: {meta_data}")
                print(f"         Content: {content_preview}")
                if j < len(documents_with_name):
                    print()
            print("-" * 80)
        
        print(f"Total unique names: {len(sorted_names)}")
        print(f"Total documents: {sum(len(docs) for docs in name_groups.values())}")
            
    except Exception as e:
        print(f"❌ Error listing unique names: {e}")

def manage_documents_by_unique_name():
    """Manage documents by unique name in a selected collection."""
    try:
        # Get all collections
        collections = client.get_collections()
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        print("=== Available Collections ===")
        for i, collection_info in enumerate(collections.collections, 1):
            collection_name = collection_info.name
            count_result = client.count(collection_name=collection_name, exact=True)
            print(f"{i}. {collection_name} ({count_result.count} documents)")
        
        print("\nEnter the number of the collection to manage documents by name (or 0 to cancel):")
        try:
            choice = int(input("Choice: "))
            if choice == 0:
                print("Operation cancelled.")
                return
            
            if 1 <= choice <= len(collections.collections):
                selected_collection = collections.collections[choice - 1].name
                delete_documents_by_unique_name(selected_collection)
            else:
                print("Invalid choice. Please enter a valid number.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error accessing collections: {e}")

def delete_documents_by_unique_name(collection_name):
    """Delete documents by unique name from a specific collection."""
    try:
        count_result = client.count(collection_name=collection_name, exact=True)
        
        if count_result.count == 0:
            print(f"No documents found in collection '{collection_name}'.")
            return
        
        print(f"\n=== Manage Documents by Unique Name in Collection: {collection_name} ===")
        
        # Get all documents and group by name
        documents = []
        offset = None
        page_size = 100
        
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
            
            documents.extend(points)
            offset = next_offset
            if offset is None:
                break
        
        # Group documents by name
        name_groups = {}
        for point in documents:
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            if name not in name_groups:
                name_groups[name] = []
            name_groups[name].append(point)
        
        # Sort names alphabetically
        sorted_names = sorted(name_groups.keys(), key=str.lower)
        
        print(f"Found {len(sorted_names)} unique document names:")
        print("=" * 60)
        
        # Display unique names with numbers
        for i, name in enumerate(sorted_names, 1):
            documents_with_name = name_groups[name]
            count = len(documents_with_name)
            print(f"{i:3d}. {name} ({count} document{'s' if count > 1 else ''})")
        
        print("=" * 60)
        print("\nChoose an option:")
        print("1. Delete documents by unique name (select by number)")
        print("2. Delete all documents with duplicate names")
        print("3. Show detailed view of a unique name")
        print("0. Cancel")
        
        try:
            option = int(input("Choice: "))
            
            if option == 0:
                print("Operation cancelled.")
                return
            elif option == 1:
                delete_by_unique_name_selection(collection_name, sorted_names, name_groups)
            elif option == 2:
                delete_duplicate_documents(collection_name, name_groups)
            elif option == 3:
                show_detailed_view_by_name(sorted_names, name_groups)
            else:
                print("Invalid choice.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error managing documents by unique name in collection '{collection_name}': {e}")

def delete_by_unique_name_selection(collection_name, sorted_names, name_groups):
    """Delete documents by selecting unique names by number."""
    try:
        print("\nEnter unique name numbers to delete (comma-separated, e.g., 1,3,5):")
        print("This will delete ALL documents with the selected names.")
        selection = input("Name numbers: ").strip()
        
        if not selection:
            print("No selection provided.")
            return
        
        try:
            # Parse selected numbers
            selected_numbers = [int(x.strip()) for x in selection.split(',') if x.strip()]
            
            if not selected_numbers:
                print("No valid numbers provided.")
                return
            
            # Validate numbers
            invalid_numbers = [num for num in selected_numbers if num < 1 or num > len(sorted_names)]
            if invalid_numbers:
                print(f"Invalid name numbers: {invalid_numbers}")
                return
            
            # Get names and documents to delete
            names_to_delete = [sorted_names[num - 1] for num in selected_numbers]
            all_docs_to_delete = []
            
            print(f"\n⚠️  You are about to delete ALL documents with the following names:")
            total_docs = 0
            for i, name in enumerate(names_to_delete, 1):
                docs_with_name = name_groups[name]
                all_docs_to_delete.extend(docs_with_name)
                total_docs += len(docs_with_name)
                print(f"  {i}. '{name}' - {len(docs_with_name)} document(s)")
            
            print(f"\nTotal documents to delete: {total_docs}")
            
            confirm = input("\nType 'DELETE' to confirm deletion: ").strip()
            
            if confirm == 'DELETE':
                # Delete all selected documents
                doc_ids = [doc.id for doc in all_docs_to_delete]
                
                client.delete(
                    collection_name=collection_name,
                    points_selector=doc_ids
                )
                
                print(f"✅ Successfully deleted {total_docs} document(s) with {len(names_to_delete)} unique name(s) from collection '{collection_name}'.")
                
                # Show summary
                for name in names_to_delete:
                    count = len(name_groups[name])
                    print(f"   - Deleted {count} document(s) named '{name}'")
            else:
                print("Deletion cancelled.")
                
        except ValueError:
            print("Invalid input. Please enter comma-separated numbers.")
            
    except Exception as e:
        print(f"❌ Error deleting documents by unique name: {e}")

def delete_duplicate_documents(collection_name, name_groups):
    """Delete all documents that have duplicate names (keeping only one of each)."""
    try:
        # Find names with more than one document
        duplicate_names = {name: docs for name, docs in name_groups.items() if len(docs) > 1}
        
        if not duplicate_names:
            print("No duplicate document names found.")
            return
        
        print(f"Found {len(duplicate_names)} unique names with duplicates:")
        total_duplicates = 0
        
        for name, docs in duplicate_names.items():
            duplicate_count = len(docs) - 1  # Keep one, delete the rest
            total_duplicates += duplicate_count
            print(f"  - '{name}': {len(docs)} documents (will delete {duplicate_count})")
        
        print(f"\nTotal duplicate documents to delete: {total_duplicates}")
        print("Note: This will keep the first document of each name and delete the rest.")
        
        confirm = input("\nType 'DELETE DUPLICATES' to confirm: ").strip()
        
        if confirm == 'DELETE DUPLICATES':
            docs_to_delete = []
            
            for name, docs in duplicate_names.items():
                # Keep first document, delete the rest
                docs_to_delete.extend(docs[1:])
            
            doc_ids = [doc.id for doc in docs_to_delete]
            
            client.delete(
                collection_name=collection_name,
                points_selector=doc_ids
            )
            
            print(f"✅ Successfully deleted {len(doc_ids)} duplicate documents from collection '{collection_name}'.")
            
            # Show summary
            for name, docs in duplicate_names.items():
                deleted_count = len(docs) - 1
                print(f"   - '{name}': Kept 1, deleted {deleted_count}")
        else:
            print("Deletion cancelled.")
            
    except Exception as e:
        print(f"❌ Error deleting duplicate documents: {e}")

def show_detailed_view_by_name(sorted_names, name_groups):
    """Show detailed view of documents for a selected unique name."""
    try:
        print("\nEnter the number of the unique name to view details:")
        try:
            choice = int(input("Choice: "))
            
            if 1 <= choice <= len(sorted_names):
                selected_name = sorted_names[choice - 1]
                documents_with_name = name_groups[selected_name]
                
                print(f"\n=== Detailed View for Name: '{selected_name}' ===")
                print(f"Total documents with this name: {len(documents_with_name)}")
                print("=" * 80)
                
                for i, point in enumerate(documents_with_name, 1):
                    payload = point.payload or {}
                    meta_data = payload.get('meta_data', {})
                    content = payload.get('content', 'No content')
                    
                    print(f"Document {i}:")
                    print(f"  ID: {point.id}")
                    print(f"  Name: {payload.get('name', 'Unknown')}")
                    if meta_data:
                        print(f"  Metadata: {meta_data}")
                    print(f"  Content Length: {len(content)} characters")
                    print(f"  Content Preview: {content[:300]}{'...' if len(content) > 300 else ''}")
                    print("-" * 80)
                    
            else:
                print("Invalid choice.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error showing detailed view: {e}")

def delete_documents_from_collection():
    """Delete documents from a selected collection."""
    try:
        # Get all collections
        collections = client.get_collections()
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        print("=== Available Collections ===")
        for i, collection_info in enumerate(collections.collections, 1):
            collection_name = collection_info.name
            count_result = client.count(collection_name=collection_name, exact=True)
            print(f"{i}. {collection_name} ({count_result.count} documents)")
        
        print("\nEnter the number of the collection to manage documents (or 0 to cancel):")
        try:
            choice = int(input("Choice: "))
            if choice == 0:
                print("Operation cancelled.")
                return
            
            if 1 <= choice <= len(collections.collections):
                selected_collection = collections.collections[choice - 1].name
                manage_documents_in_collection(selected_collection)
            else:
                print("Invalid choice. Please enter a valid number.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error accessing collections: {e}")

def manage_documents_in_collection(collection_name):
    """Manage documents within a specific collection."""
    try:
        count_result = client.count(collection_name=collection_name, exact=True)
        
        if count_result.count == 0:
            print(f"No documents found in collection '{collection_name}'.")
            return
        
        print(f"\n=== Documents in Collection: {collection_name} ===")
        
        # Get all documents
        documents = []
        offset = None
        page_size = 100
        
        while True:
            scroll_result = client.scroll(
                collection_name=collection_name,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            points, next_offset = scroll_result
            
            if not points:
                break
            
            documents.extend(points)
            offset = next_offset
            if offset is None:
                break
        
        # Display documents with numbers
        for i, point in enumerate(documents, 1):
            payload = point.payload or {}
            name = payload.get('name', 'Unknown')
            content_preview = payload.get('content', '')[:50] + "..." if payload.get('content') else "No content"
            print(f"{i}. Name: {name}")
            print(f"   ID: {point.id}")
            print(f"   Content: {content_preview}")
            print()
        
        print("Choose an option:")
        print("1. Delete specific documents by number")
        print("2. Delete all documents in this collection")
        print("0. Cancel")
        
        try:
            option = int(input("Choice: "))
            
            if option == 0:
                print("Operation cancelled.")
                return
            elif option == 1:
                delete_specific_documents(collection_name, documents)
            elif option == 2:
                delete_all_documents_in_collection(collection_name)
            else:
                print("Invalid choice.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
            
    except Exception as e:
        print(f"❌ Error managing documents in collection '{collection_name}': {e}")

def delete_specific_documents(collection_name, documents):
    """Delete specific documents by their numbers."""
    try:
        print("\nEnter document numbers to delete (comma-separated, e.g., 1,3,5) or 'all' for all documents:")
        selection = input("Document numbers: ").strip()
        
        if selection.lower() == 'all':
            delete_all_documents_in_collection(collection_name)
            return
        
        try:
            # Parse selected numbers
            selected_numbers = [int(x.strip()) for x in selection.split(',') if x.strip()]
            
            if not selected_numbers:
                print("No valid numbers provided.")
                return
            
            # Validate numbers
            invalid_numbers = [num for num in selected_numbers if num < 1 or num > len(documents)]
            if invalid_numbers:
                print(f"Invalid document numbers: {invalid_numbers}")
                return
            
            # Get document IDs to delete
            docs_to_delete = [documents[num - 1] for num in selected_numbers]
            doc_ids = [doc.id for doc in docs_to_delete]
            
            # Show documents to be deleted
            print(f"\n⚠️  You are about to delete {len(docs_to_delete)} document(s):")
            for i, doc in enumerate(docs_to_delete, 1):
                payload = doc.payload or {}
                name = payload.get('name', 'Unknown')
                print(f"  {i}. {name} (ID: {doc.id})")
            
            confirm = input("\nType 'yes' to confirm deletion: ").lower().strip()
            
            if confirm == 'yes':
                client.delete(
                    collection_name=collection_name,
                    points_selector=doc_ids
                )
                print(f"✅ Successfully deleted {len(doc_ids)} document(s) from collection '{collection_name}'.")
            else:
                print("Deletion cancelled.")
                
        except ValueError:
            print("Invalid input. Please enter comma-separated numbers.")
            
    except Exception as e:
        print(f"❌ Error deleting specific documents: {e}")

def delete_all_documents_in_collection(collection_name):
    """Delete all documents in a collection."""
    try:
        count_result = client.count(collection_name=collection_name, exact=True)
        
        if count_result.count == 0:
            print(f"No documents to delete in collection '{collection_name}'.")
            return
        
        print(f"\n⚠️  Are you sure you want to delete ALL {count_result.count} document(s) from collection '{collection_name}'?")
        print("This action cannot be undone!")
        confirm = input("Type 'DELETE ALL' to confirm: ").strip()
        
        if confirm == 'DELETE ALL':
            # Delete all points in the collection
            client.delete(
                collection_name=collection_name,
                points_selector=True  # This deletes all points
            )
            print(f"✅ Successfully deleted all documents from collection '{collection_name}'.")
        else:
            print("Deletion cancelled.")
            
    except Exception as e:
        print(f"❌ Error deleting all documents: {e}")

def delete_all_collections():
    """Delete all collections in the Qdrant database."""
    try:
        # Get all collections
        collections = client.get_collections()
        
        if not collections.collections:
            print("No collections found in the database.")
            return
        
        print("=== All Collections in Database ===")
        total_documents = 0
        
        for i, collection_info in enumerate(collections.collections, 1):
            collection_name = collection_info.name
            count_result = client.count(collection_name=collection_name, exact=True)
            total_documents += count_result.count
            print(f"{i}. {collection_name} ({count_result.count} documents)")
        
        print(f"\nTotal collections: {len(collections.collections)}")
        print(f"Total documents across all collections: {total_documents}")
        
        print(f"\n⚠️  Are you sure you want to delete ALL {len(collections.collections)} collection(s)?")
        print(f"This will permanently delete {total_documents} document(s) across all collections!")
        
        confirm = input("Type 'yes' to confirm deletion: ").lower().strip()
        
        if confirm == 'yes':
            print("\nDeleting all collections...")
            
            deleted_collections = []
            failed_deletions = []
            
            for collection_info in collections.collections:
                collection_name = collection_info.name
                try:
                    client.delete_collection(collection_name)
                    deleted_collections.append(collection_name)
                    print(f"✅ Deleted collection: {collection_name}")
                except Exception as e:
                    failed_deletions.append((collection_name, str(e)))
                    print(f"❌ Failed to delete collection '{collection_name}': {e}")
            
            print(f"\n=== Deletion Summary ===")
            print(f"Successfully deleted: {len(deleted_collections)} collection(s)")
            if deleted_collections:
                for name in deleted_collections:
                    print(f"  ✅ {name}")
            
            if failed_deletions:
                print(f"Failed to delete: {len(failed_deletions)} collection(s)")
                for name, error in failed_deletions:
                    print(f"  ❌ {name}: {error}")
            
            if len(deleted_collections) == len(collections.collections):
                print("\n🎉 All collections have been successfully deleted!")
                print("The Qdrant database is now empty.")
            
        else:
            print("Deletion cancelled.")
            
    except Exception as e:
        print(f"❌ Error deleting all collections: {e}")
        print("Make sure Qdrant is running on the configured port")

def main_menu():
    """Main interactive menu."""
    while True:
        print("\n" + "="*50)
        print("🗄️  QDRANT DATABASE MANAGER")
        print("="*50)
        print("1. List all collections and documents")
        print("2. Search/List documents by name")
        print("3. Manage documents by unique name")
        print("4. Delete a collection")
        print("5. Delete documents from a collection")
        print("6. Delete ALL collections (DANGER ZONE)")
        print("0. Exit")
        print("-" * 50)
        
        try:
            choice = int(input("Enter your choice: "))
            
            if choice == 0:
                print("Goodbye! 👋")
                break
            elif choice == 1:
                list_all_collections_and_documents()
            elif choice == 2:
                list_documents_by_name()
            elif choice == 3:
                manage_documents_by_unique_name()
            elif choice == 4:
                delete_collection_by_number()
            elif choice == 5:
                delete_documents_from_collection()
            elif choice == 6:
                delete_all_collections()
            else:
                print("Invalid choice. Please enter a number between 0-6.")
                
        except ValueError:
            print("Invalid input. Please enter a number.")
        except KeyboardInterrupt:
            print("\n\nOperation interrupted. Goodbye! 👋")
            break
        except Exception as e:
            print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main_menu()
