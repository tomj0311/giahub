"""
Database Access Migration Utility

This utility helps migrate existing database access patterns to use tenant-aware collections.
It can be used to automatically update route files to use the new secure patterns.
"""

import os
import re
import ast
from typing import List, Dict, Tuple
from pathlib import Path

from ..utils.log import logger


class DatabaseAccessMigrator:
    """
    Utility class to migrate database access patterns to tenant-aware versions.
    """
    
    def __init__(self, routes_directory: str = "backend_python/src/routes"):
        self.routes_directory = Path(routes_directory)
        self.migration_patterns = self._define_migration_patterns()
    
    def _define_migration_patterns(self) -> List[Dict[str, str]]:
        """Define patterns for migrating database access code"""
        return [
            # Replace get_collections() import
            {
                "pattern": r"from \.\.db import get_collections",
                "replacement": "from ..utils.tenant_access import tenant_db, require_tenant_access",
                "description": "Update import to use tenant-aware access"
            },
            
            # Replace collections = get_collections() pattern
            {
                "pattern": r"collections = get_collections\(\)",
                "replacement": "# collections injected via tenant_db.collections dependency",
                "description": "Remove manual collection retrieval"
            },
            
            # Add tenant_access dependency to function signatures
            {
                "pattern": r"async def (\w+)\(\s*(.*?)\s*user: dict = Depends\(verify_token_middleware\)\s*\):",
                "replacement": r"async def \1(\2user: dict = Depends(verify_token_middleware), collections = Depends(tenant_db.collections)):",
                "description": "Add tenant collections dependency"
            },
            
            # Remove manual tenant_id filtering from queries
            {
                "pattern": r'base_query\["tenantId"\] = tenant_id',
                "replacement": "# tenant filtering is automatic",
                "description": "Remove manual tenant filtering"
            },
            
            # Remove manual tenant_id validation
            {
                "pattern": r"tenant_id = user\.get\(\"tenantId\"\)\s+if not tenant_id:\s+.*?detail=\".*?\"\s+\)",
                "replacement": "# tenant validation is automatic",
                "description": "Remove manual tenant validation",
                "flags": re.MULTILINE | re.DOTALL
            }
        ]
    
    def migrate_file(self, file_path: Path) -> bool:
        """
        Migrate a single Python file to use tenant-aware database access.
        
        Returns:
            bool: True if file was modified, False otherwise
        """
        if not file_path.exists() or file_path.suffix != '.py':
            return False
        
        logger.info(f"[MIGRATION] Processing file: {file_path}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            modified = False
            
            # Apply migration patterns
            for pattern_info in self.migration_patterns:
                pattern = pattern_info["pattern"]
                replacement = pattern_info["replacement"]
                flags = pattern_info.get("flags", 0)
                
                new_content = re.sub(pattern, replacement, content, flags=flags)
                if new_content != content:
                    logger.debug(f"[MIGRATION] Applied pattern: {pattern_info['description']}")
                    content = new_content
                    modified = True
            
            # Additional custom migrations for specific patterns
            content, custom_modified = self._apply_custom_migrations(content)
            modified = modified or custom_modified
            
            # Write back if modified
            if modified:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                logger.info(f"[MIGRATION] Successfully migrated: {file_path}")
                return True
            else:
                logger.debug(f"[MIGRATION] No changes needed for: {file_path}")
                return False
                
        except Exception as e:
            logger.error(f"[MIGRATION] Error processing {file_path}: {e}")
            return False
    
    def _apply_custom_migrations(self, content: str) -> Tuple[str, bool]:
        """
        Apply custom migration patterns that are too complex for simple regex.
        
        Returns:
            Tuple[str, bool]: (modified_content, was_modified)
        """
        modified = False
        original_content = content
        
        # Add @require_tenant_access decorator to route functions
        route_pattern = r'(@router\.(get|post|put|delete|patch)\([^)]+\)\s*\n)(\s*async def \w+\()'
        
        def add_tenant_decorator(match):
            router_decorator = match.group(1)
            method_line = match.group(3)
            
            # Check if @require_tenant_access is already present
            if "@require_tenant_access" not in router_decorator:
                return f"{router_decorator}@require_tenant_access()\n{method_line}"
            return match.group(0)
        
        content = re.sub(route_pattern, add_tenant_decorator, content, flags=re.MULTILINE)
        
        if content != original_content:
            modified = True
        
        return content, modified
    
    def migrate_directory(self, directory: Path = None) -> Dict[str, bool]:
        """
        Migrate all Python files in a directory to use tenant-aware database access.
        
        Returns:
            Dict[str, bool]: Mapping of file paths to whether they were modified
        """
        if directory is None:
            directory = self.routes_directory
        
        results = {}
        
        if not directory.exists():
            logger.error(f"[MIGRATION] Directory not found: {directory}")
            return results
        
        python_files = list(directory.glob("**/*.py"))
        logger.info(f"[MIGRATION] Found {len(python_files)} Python files to process")
        
        for file_path in python_files:
            # Skip __init__.py and __pycache__ files
            if file_path.name.startswith('__'):
                continue
            
            try:
                was_modified = self.migrate_file(file_path)
                results[str(file_path)] = was_modified
            except Exception as e:
                logger.error(f"[MIGRATION] Failed to process {file_path}: {e}")
                results[str(file_path)] = False
        
        return results
    
    def generate_migration_report(self, results: Dict[str, bool]) -> str:
        """Generate a report of migration results"""
        total_files = len(results)
        modified_files = sum(1 for modified in results.values() if modified)
        unchanged_files = total_files - modified_files
        
        report = f"""
TENANT-AWARE DATABASE MIGRATION REPORT
=====================================

Total files processed: {total_files}
Files modified: {modified_files}
Files unchanged: {unchanged_files}

MODIFIED FILES:
"""
        
        for file_path, was_modified in results.items():
            if was_modified:
                report += f"  ✓ {file_path}\n"
        
        report += "\nUNCHANGED FILES:\n"
        for file_path, was_modified in results.items():
            if not was_modified:
                report += f"  - {file_path}\n"
        
        report += f"""
NEXT STEPS:
1. Review all modified files for correctness
2. Test tenant isolation thoroughly
3. Update any remaining manual database access patterns
4. Verify exempt collections (menuItems, tenants) still work correctly
5. Run comprehensive tests with multiple tenants

SECURITY BENEFITS:
✓ Automatic tenant_id filtering on all database operations
✓ Impossible to forget tenant filtering
✓ Automatic tenant_id injection on inserts/updates
✓ Consistent error handling for tenant access violations
✓ Audit logging of all tenant database operations
"""
        
        return report
    
    def validate_migration(self, file_path: Path) -> List[str]:
        """
        Validate that a migrated file follows tenant-aware patterns correctly.
        
        Returns:
            List[str]: List of validation warnings/errors
        """
        warnings = []
        
        if not file_path.exists():
            return [f"File not found: {file_path}"]
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Check for common anti-patterns
            if "get_collections()" in content:
                warnings.append("Still uses get_collections() - should use tenant_db.collections")
            
            if 'tenantId"] = ' in content and "# tenant" not in content:
                warnings.append("Still has manual tenant_id assignment - should be automatic")
            
            if 'tenant_id = user.get("tenantId")' in content:
                warnings.append("Still has manual tenant_id extraction - should be automatic")
            
            # Check for missing tenant access decorators
            route_patterns = re.findall(r'@router\.(get|post|put|delete|patch)\([^)]+\)', content)
            tenant_decorators = re.findall(r'@require_tenant_access', content)
            
            if route_patterns and not tenant_decorators:
                warnings.append("Routes found but no @require_tenant_access decorators")
            
            # Check for tenant_db import
            if "tenant_db" in content and "from ..utils.tenant_access import" not in content:
                warnings.append("Uses tenant_db but missing proper import")
            
        except Exception as e:
            warnings.append(f"Error validating file: {e}")
        
        return warnings


def run_migration(routes_dir: str = None) -> None:
    """
    Run the complete database access migration process.
    
    Args:
        routes_dir: Directory containing route files to migrate
    """
    if routes_dir is None:
        routes_dir = "backend_python/src/routes"
    
    logger.info("[MIGRATION] Starting tenant-aware database migration")
    
    migrator = DatabaseAccessMigrator(routes_dir)
    results = migrator.migrate_directory()
    
    # Generate and display report
    report = migrator.generate_migration_report(results)
    print(report)
    
    # Validate migrated files
    logger.info("[MIGRATION] Validating migrated files...")
    validation_results = {}
    
    for file_path, was_modified in results.items():
        if was_modified:
            warnings = migrator.validate_migration(Path(file_path))
            if warnings:
                validation_results[file_path] = warnings
    
    if validation_results:
        print("\nVALIDATION WARNINGS:")
        print("===================")
        for file_path, warnings in validation_results.items():
            print(f"\n{file_path}:")
            for warning in warnings:
                print(f"  ⚠️  {warning}")
    else:
        print("\n✅ All migrated files passed validation!")
    
    logger.info("[MIGRATION] Migration process completed")


if __name__ == "__main__":
    # Run migration when script is executed directly
    run_migration()
