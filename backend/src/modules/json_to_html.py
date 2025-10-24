"""
JSON to HTML conversion utilities for dynamic function execution.
Based on the DynamicJSONToHTML class functionality.
"""

import pandas as pd
import json
from datetime import datetime
from typing import Dict, List, Any, Optional, Union
import re
from io import StringIO


def convert_json_to_html(json_data: Union[Dict, List, str], 
                        title: str = "JSON Data Report",
                        max_cell_length: int = 100) -> str:
    """
    Convert JSON data to an HTML report.
    
    Args:
        json_data: JSON data as dict, list, or JSON string
        title: Title for the HTML report
        max_cell_length: Maximum length for cell content before truncation
        
    Returns:
        HTML content as string
    """
    # Parse JSON string if needed
    if isinstance(json_data, str):
        try:
            json_data = json.loads(json_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON string: {e}")
    
    # Extract tables from JSON
    tables = extract_tables_from_json(json_data)
    
    # Generate summary stats
    stats = generate_summary_stats(tables)
    
    # Create styled tables HTML
    tables_html = ""
    for table_name, df in tables.items():
        styled_df = style_dataframe(df, table_name.replace('_', ' ').title(), max_cell_length)
        tables_html += f'<div class="table-container">{styled_df.to_html(escape=False)}</div>'
    
    # Create summary cards HTML
    summary_cards = ""
    for table_name, table_info in stats['table_info'].items():
        summary_cards += f"""
        <div class="stat-card">
            <h3>{table_name.replace('_', ' ').title()}</h3>
            <div class="stat-number">{table_info['row_count']}</div>
            <div class="stat-label">Records</div>
            <div class="stat-detail">{table_info['column_count']} columns</div>
        </div>
        """
    
    # Generate complete HTML
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }}
            
            .container {{
                max-width: 1400px;
                margin: 0 auto;
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }}
            
            .header {{
                text-align: center;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 3px solid #667eea;
            }}
            
            .header h1 {{
                color: #343a40;
                font-size: 2.5em;
                margin-bottom: 10px;
            }}
            
            .header .subtitle {{
                color: #6c757d;
                font-size: 1.1em;
            }}
            
            .summary-stats {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }}
            
            .stat-card {{
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 25px;
                border-radius: 15px;
                text-align: center;
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
                transition: transform 0.3s ease;
            }}
            
            .stat-card:hover {{
                transform: translateY(-5px);
            }}
            
            .stat-card h3 {{
                font-size: 1.1em;
                margin-bottom: 15px;
                opacity: 0.9;
            }}
            
            .stat-number {{
                font-size: 2.5em;
                font-weight: bold;
                margin-bottom: 5px;
            }}
            
            .stat-label {{
                font-size: 1em;
                opacity: 0.8;
            }}
            
            .stat-detail {{
                font-size: 0.9em;
                opacity: 0.7;
                margin-top: 5px;
            }}
            
            .table-container {{
                margin-bottom: 50px;
                overflow-x: auto;
                background: white;
                border-radius: 15px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
            }}
            
            table {{
                border-collapse: collapse;
                margin: 25px 0;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                min-width: 100%;
                box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);
                border-radius: 10px;
                overflow: hidden;
            }}
            
            th {{
                background-color: #343a40;
                color: white;
                font-weight: bold;
                text-align: center;
                padding: 15px;
                font-size: 14px;
            }}
            
            td {{
                text-align: left;
                padding: 12px;
                border-bottom: 1px solid #dee2e6;
                font-size: 13px;
            }}
            
            tr:nth-child(even) {{
                background-color: #f8f9fa;
            }}
            
            tr:hover {{
                background-color: #e9ecef;
            }}
            
            .footer {{
                text-align: center;
                color: #6c757d;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #dee2e6;
            }}
            
            @media (max-width: 768px) {{
                .container {{
                    padding: 20px;
                    margin: 10px;
                }}
                
                .header h1 {{
                    font-size: 2em;
                }}
                
                .summary-stats {{
                    grid-template-columns: 1fr;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 {title}</h1>
                <div class="subtitle">Comprehensive Data Analysis Dashboard</div>
            </div>
            
            <div class="summary-stats">
                <div class="stat-card">
                    <div class="stat-number">{stats['total_tables']}</div>
                    <div class="stat-label">Data Tables</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">{stats['total_records']}</div>
                    <div class="stat-label">Total Records</div>
                </div>
                {summary_cards}
            </div>
            
            {tables_html}
            
            <div class="footer">
                <p>📈 Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                <p>Powered by JSON to HTML Converter</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html_content


def flatten_json(data: Union[Dict, List], parent_key: str = '', sep: str = '_') -> Dict:
    """
    Recursively flatten nested JSON structure.
    
    Args:
        data: JSON data (dict or list)
        parent_key: Parent key for nested structure
        sep: Separator for nested keys
        
    Returns:
        Flattened dictionary
    """
    items = []
    
    if isinstance(data, dict):
        for k, v in data.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            
            if isinstance(v, dict):
                items.extend(flatten_json(v, new_key, sep=sep).items())
            elif isinstance(v, list):
                if v and isinstance(v[0], dict):
                    # Handle list of objects - create summary
                    items.append((f"{new_key}_count", len(v)))
                    if len(v) > 0:
                        # Add info about first item as sample
                        sample_keys = list(v[0].keys())[:3]  # First 3 keys as sample
                        items.append((f"{new_key}_sample_keys", ', '.join(sample_keys)))
                else:
                    # Handle list of primitives
                    items.append((new_key, ', '.join(map(str, v[:5])) + ('...' if len(v) > 5 else '')))
            else:
                items.append((new_key, v))
    
    elif isinstance(data, list):
        for i, item in enumerate(data):
            if isinstance(item, dict):
                items.extend(flatten_json(item, f"{parent_key}{sep}{i}" if parent_key else str(i), sep=sep).items())
            else:
                items.append((f"{parent_key}{sep}{i}" if parent_key else str(i), item))
    
    return dict(items)


def extract_tables_from_json(data: Union[Dict, List]) -> Dict[str, pd.DataFrame]:
    """
    Extract multiple tables from JSON data based on structure.
    
    Args:
        data: JSON data
        
    Returns:
        Dictionary of DataFrames with descriptive names
    """
    tables = {}
    
    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            # List of objects - create main table
            flattened_data = []
            for item in data:
                flattened_data.append(flatten_json(item))
            
            df = pd.DataFrame(flattened_data)
            tables['main_data'] = process_dataframe(df)
            
            # Look for nested arrays that could be separate tables
            _extract_nested_tables(data, tables)
        else:
            # List of primitives
            df = pd.DataFrame({'values': data})
            tables['simple_list'] = process_dataframe(df)
    
    elif isinstance(data, dict):
        # Single object - flatten and create table
        flattened = flatten_json(data)
        df = pd.DataFrame([flattened])
        tables['object_data'] = process_dataframe(df)
        
        # Look for nested structures
        _extract_nested_tables([data], tables)
    
    return tables


def _extract_nested_tables(data: List[Dict], tables: Dict[str, pd.DataFrame]):
    """Extract nested arrays as separate tables."""
    if not data or not isinstance(data[0], dict):
        return
    
    # Find common array fields
    array_fields = {}
    for item in data[:5]:  # Check first 5 items for performance
        for key, value in item.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                if key not in array_fields:
                    array_fields[key] = []
                array_fields[key].extend(value)
    
    # Create tables for each array field
    for field_name, field_data in array_fields.items():
        if len(field_data) > 0:
            flattened_data = []
            for item in field_data:
                flattened_data.append(flatten_json(item))
            
            df = pd.DataFrame(flattened_data)
            tables[f"{field_name}_details"] = process_dataframe(df)


def detect_date_column(value: str) -> bool:
    """Detect if a string value represents a date."""
    if not isinstance(value, str) or len(value) < 8:
        return False
    
    date_patterns = [
        r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',  # ISO format
        r'\d{4}-\d{2}-\d{2}',  # Date only
        r'\d{2}/\d{2}/\d{4}',  # MM/DD/YYYY
        r'\d{2}-\d{2}-\d{4}'   # DD-MM-YYYY
    ]
    
    for pattern in date_patterns:
        if re.search(pattern, value):
            return True
    return False


def format_date(date_str: str) -> str:
    """Format various date string formats to readable format."""
    if not date_str or not isinstance(date_str, str):
        return str(date_str) if date_str else ""
    
    try:
        # Try different parsing approaches
        formats_to_try = [
            '%Y-%m-%dT%H:%M:%S.%f',
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d',
            '%m/%d/%Y',
            '%d-%m-%Y',
            '%d/%m/%Y'
        ]
        
        for fmt in formats_to_try:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d %H:%M') if 'T' in date_str else dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        return date_str  # Return original if parsing fails
    except:
        return str(date_str)


def truncate_text(text: str, max_length: int = 100) -> str:
    """Truncate long text with ellipsis."""
    if not isinstance(text, str):
        text = str(text)
    
    if len(text) > max_length:
        return text[:max_length-3] + "..."
    return text


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Process DataFrame - format dates, truncate text, etc.
    
    Args:
        df: Input DataFrame
        
    Returns:
        Processed DataFrame
    """
    processed_df = df.copy()
    
    for col in processed_df.columns:
        # Check if column contains dates
        sample_values = processed_df[col].dropna().astype(str).head(10)
        if any(detect_date_column(val) for val in sample_values):
            processed_df[col] = processed_df[col].apply(format_date)
        
        # Truncate long text
        processed_df[col] = processed_df[col].apply(lambda x: truncate_text(str(x), 100))
        
        # Clean column names
        new_col_name = col.replace('_', ' ').title()
        if new_col_name != col:
            processed_df.rename(columns={col: new_col_name}, inplace=True)
    
    return processed_df


def style_dataframe(df: pd.DataFrame, title: str, max_cell_length: int = 100) -> pd.DataFrame:
    """
    Apply comprehensive styling to DataFrame.
    
    Args:
        df: DataFrame to style
        title: Title for the table
        max_cell_length: Maximum cell content length
        
    Returns:
        Styled DataFrame
    """
    # Status and priority color mappings
    status_colors = {
        'new': '#007bff', 'active': '#28a745', 'inactive': '#6c757d',
        'pending': '#ffc107', 'completed': '#28a745', 'cancelled': '#dc3545',
        'in progress': '#17a2b8', 'on hold': '#fd7e14', 'draft': '#6f42c1',
        'approved': '#28a745', 'rejected': '#dc3545', 'review': '#ffc107'
    }
    
    priority_colors = {
        'low': '#28a745', 'medium': '#ffc107', 'high': '#fd7e14', 
        'critical': '#dc3545', 'urgent': '#dc3545', 'normal': '#6c757d'
    }
    
    def apply_color_styling(val, column_name):
        """Apply color styling based on column content."""
        if pd.isna(val):
            return ''
        
        val_str = str(val).lower()
        column_lower = column_name.lower()
        
        # Status coloring
        if any(keyword in column_lower for keyword in ['status', 'state', 'condition']):
            color = status_colors.get(val_str, '#6c757d')
            return f'background-color: {color}; color: white; font-weight: bold; padding: 8px; border-radius: 4px;'
        
        # Priority coloring
        elif any(keyword in column_lower for keyword in ['priority', 'importance', 'urgency']):
            color = priority_colors.get(val_str, '#6c757d')
            return f'background-color: {color}; color: white; font-weight: bold; padding: 8px; border-radius: 4px;'
        
        # Progress bar for percentage values
        elif any(keyword in column_lower for keyword in ['progress', 'completion', 'percent']) or '%' in str(val):
            try:
                numeric_val = float(str(val).replace('%', ''))
                if 0 <= numeric_val <= 100:
                    color = '#28a745' if numeric_val >= 80 else '#ffc107' if numeric_val >= 50 else '#dc3545'
                    return f'background: linear-gradient(90deg, {color} {numeric_val}%, #e9ecef {numeric_val}%); padding: 8px; border-radius: 4px;'
            except:
                pass
        
        return ''
    
    # Apply styling
    styled_df = df.style
    
    # Apply cell-level styling
    for col in df.columns:
        styled_df = styled_df.applymap(lambda val: apply_color_styling(val, col), subset=[col])
    
    # Set caption
    styled_df = styled_df.set_caption(f"<h2 style='color: #343a40; margin-bottom: 20px; text-align: center;'>{title}</h2>")
    
    return styled_df


def generate_summary_stats(tables: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
    """Generate summary statistics for the dashboard."""
    stats = {
        'total_tables': len(tables),
        'total_records': sum(len(df) for df in tables.values()),
        'table_info': {}
    }
    
    for table_name, df in tables.items():
        table_stats = {
            'row_count': len(df),
            'column_count': len(df.columns),
            'columns': list(df.columns)
        }
        
        # Look for interesting metrics
        for col in df.columns:
            col_lower = col.lower()
            if any(keyword in col_lower for keyword in ['status', 'state']):
                table_stats['status_distribution'] = df[col].value_counts().to_dict()
            elif any(keyword in col_lower for keyword in ['priority']):
                table_stats['priority_distribution'] = df[col].value_counts().to_dict()
        
        stats['table_info'][table_name] = table_stats
    
    return stats


def json_to_csv(json_data: Union[Dict, List, str], separator: str = ",") -> str:
    """
    Convert JSON data to CSV format.
    
    Args:
        json_data: JSON data as dict, list, or JSON string
        separator: CSV separator
        
    Returns:
        CSV formatted string
    """
    # Parse JSON string if needed
    if isinstance(json_data, str):
        try:
            json_data = json.loads(json_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON string: {e}")
    
    # Extract main table
    tables = extract_tables_from_json(json_data)
    
    if not tables:
        return ""
    
    # Get the first (main) table
    main_table = list(tables.values())[0]
    
    # Convert to CSV
    output = StringIO()
    main_table.to_csv(output, index=False, sep=separator)
    return output.getvalue()


def json_to_table_data(json_data: Union[Dict, List, str]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Convert JSON data to table format (list of dictionaries).
    
    Args:
        json_data: JSON data as dict, list, or JSON string
        
    Returns:
        Dictionary with table names as keys and list of records as values
    """
    # Parse JSON string if needed
    if isinstance(json_data, str):
        try:
            json_data = json.loads(json_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON string: {e}")
    
    # Extract tables
    tables = extract_tables_from_json(json_data)
    
    # Convert DataFrames to list of dictionaries
    result = {}
    for table_name, df in tables.items():
        result[table_name] = df.to_dict('records')
    
    return result


def create_simple_html_table(json_data: Union[Dict, List, str], title: str = "Data Table") -> str:
    """
    Create a simple HTML table from JSON data without complex styling.
    
    Args:
        json_data: JSON data as dict, list, or JSON string
        title: Table title
        
    Returns:
        Simple HTML table as string
    """
    # Parse JSON string if needed
    if isinstance(json_data, str):
        try:
            json_data = json.loads(json_data)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON string: {e}")
    
    # Extract main table
    tables = extract_tables_from_json(json_data)
    
    if not tables:
        return f"<h3>{title}</h3><p>No data to display</p>"
    
    # Get the first (main) table
    main_table = list(tables.values())[0]
    
    # Generate simple HTML table
    html = f"<h3>{title}</h3>\n"
    html += main_table.to_html(index=False, escape=False, classes='table table-striped')
    
    return html