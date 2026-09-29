import sys
import pandas as pd

# Ensure standard output can handle Bengali/Unicode characters without crashing on Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load your places dataset
df = pd.read_csv('data/full_dhaka_places.csv')

# Areas to monitor
areas = [
    'Mirpur 1', 'Mirpur 10', 'Mirpur 11', 'Mirpur 12',
    'Dhanmondi', 'Gulshan 1', 'Gulshan 2', 'Banani',
    'Shantinagar', 'Khilgaon'
]

flagged = []

for idx, row in df.iterrows():
    name = str(row.get('Name', ''))
    assigned_area = str(row.get('Area', '')).strip()
    address = str(row.get('Address', '')).lower()
    
    # Check if address explicitly mentions another known area
    for target in areas:
        if target.lower() in address and target.lower() != assigned_area.lower():
            flagged.append({
                'Name': name,
                'Assigned_Area': assigned_area,
                'Detected_In_Address': target,
                'Full_Address': row.get('Address', '')
            })

flagged_df = pd.DataFrame(flagged)
print(f"Total potential mismatches detected: {len(flagged_df)}")
if not flagged_df.empty:
    print(flagged_df.to_string())
    flagged_df.to_csv('data/mismatched_places.csv', index=False, encoding='utf-8-sig')
