import zstandard as zstd
import json
import csv
from pathlib import Path

def verify_files():
    library_dir = Path("math/library")
    index_path = library_dir / "index.json"
    
    with open(index_path, 'r') as f:
        index = json.load(f)
        
    print(f"Index version: {index.get('version')}")
    
    for mode in index.get("modes", []):
        print(f"\nVerifying mode: {mode['name']}")
        
        csv_path = library_dir / mode['weights']
        books_path = library_dir / mode['events']
        
        # Read CSV
        print(f"  Reading {csv_path}...")
        with open(csv_path, 'r') as f:
            csv_values = [int(line.strip()) for line in f if line.strip()]
            
        print(f"  CSV entries: {len(csv_values)}")
        
        # Read Books
        print(f"  Reading {books_path}...")
        with open(books_path, 'rb') as f:
            dctx = zstd.ZstdDecompressor()
            decompressed = dctx.decompress(f.read()).decode('utf-8')
            
        books = []
        for line in decompressed.splitlines():
            if line.strip():
                books.append(json.loads(line))
                
        print(f"  Books entries: {len(books)}")
        
        if len(csv_values) != len(books):
            print(f"MISMATCH: CSV has {len(csv_values)}, Books has {len(books)}")
            
        # Verify content match
        mismatches = 0
        for i, (val, book) in enumerate(zip(csv_values, books)):
            if book['id'] != i:
                print(f"  ID mismatch at index {i}: book id {book['id']}")
                mismatches += 1
                if mismatches > 5: break
                
            if book['payoutMultiplier'] != val:
                print(f"  Value mismatch at index {i}: CSV {val}, Book {book['payoutMultiplier']}")
                mismatches += 1
                if mismatches > 5: break
                
        if mismatches == 0:
            print("  ✓ Content matches completely")
        
        # Check specific constraints
        if mode['name'] in ['no_zero', 'bonus']:
            zeros = csv_values.count(0)
            if zeros > 0:
                print(f"  ERROR: Found {zeros} zeros in {mode['name']}")
            else:
                print("  ✓ No zeros confirmed")

if __name__ == "__main__":
    verify_files()
