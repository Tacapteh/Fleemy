#!/usr/bin/env python3

import requests
import json
from datetime import datetime

def test_dashboard_endpoints():
    """Test the three main dashboard planning endpoints"""
    
    base_url = "https://fleemyhq.preview.emergentagent.com/api"
    headers = {
        'Authorization': 'Bearer test-token-123',
        'Content-Type': 'application/json'
    }
    
    current_year = datetime.now().year
    current_week = datetime.now().isocalendar()[1]
    current_month = datetime.now().month
    
    print("🚀 Testing Dashboard Planning Endpoints")
    print("=" * 50)
    
    # Test 1: GET /api/planning/week/{year}/{week}
    print(f"\n1️⃣ Testing GET /api/planning/week/{current_year}/{current_week}")
    try:
        response = requests.get(f"{base_url}/planning/week/{current_year}/{current_week}", headers=headers)
        data = response.json()
        
        print(f"   Status: {response.status_code}")
        print(f"   Success: {data.get('success')}")
        print(f"   Events: {len(data.get('events', []))} items")
        print(f"   Tasks: {len(data.get('tasks', []))} items")
        
        # Verify structure
        required_keys = ['success', 'events', 'tasks']
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            print(f"   ❌ Missing keys: {missing_keys}")
        else:
            print(f"   ✅ All required keys present")
            
        # Verify data types
        if isinstance(data.get('events'), list) and isinstance(data.get('tasks'), list):
            print(f"   ✅ Events and tasks are lists")
        else:
            print(f"   ❌ Events or tasks are not lists")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 2: GET /api/planning/month/{year}/{month}
    print(f"\n2️⃣ Testing GET /api/planning/month/{current_year}/{current_month}")
    try:
        response = requests.get(f"{base_url}/planning/month/{current_year}/{current_month}", headers=headers)
        data = response.json()
        
        print(f"   Status: {response.status_code}")
        print(f"   Success: {data.get('success')}")
        print(f"   Events: {len(data.get('events', []))} items")
        print(f"   Tasks: {len(data.get('tasks', []))} items")
        
        # Verify structure
        required_keys = ['success', 'events', 'tasks']
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            print(f"   ❌ Missing keys: {missing_keys}")
        else:
            print(f"   ✅ All required keys present")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test 3: GET /api/planning/earnings/{year}/{week}
    print(f"\n3️⃣ Testing GET /api/planning/earnings/{current_year}/{current_week}")
    try:
        response = requests.get(f"{base_url}/planning/earnings/{current_year}/{current_week}", headers=headers)
        data = response.json()
        
        print(f"   Status: {response.status_code}")
        print(f"   Success: {data.get('success')}")
        
        earnings = data.get('earnings', {})
        print(f"   Earnings structure:")
        print(f"     - Paid: {earnings.get('paid', 'N/A')}")
        print(f"     - Pending: {earnings.get('pending', 'N/A')}")
        print(f"     - Unpaid: {earnings.get('unpaid', 'N/A')}")
        print(f"     - Total: {earnings.get('total', 'N/A')}")
        
        # Verify structure
        required_keys = ['success', 'earnings']
        missing_keys = [key for key in required_keys if key not in data]
        if missing_keys:
            print(f"   ❌ Missing keys: {missing_keys}")
        else:
            print(f"   ✅ All required keys present")
            
        # Verify earnings structure
        required_earnings_keys = ['paid', 'pending', 'unpaid', 'total']
        missing_earnings_keys = [key for key in required_earnings_keys if key not in earnings]
        if missing_earnings_keys:
            print(f"   ❌ Missing earnings keys: {missing_earnings_keys}")
        else:
            print(f"   ✅ All required earnings keys present")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test with sample data creation
    print(f"\n4️⃣ Testing with Sample Data Creation")
    
    # Create a test event
    event_data = {
        "description": "Test Dashboard Event",
        "client_id": "dashboard-test-client",
        "client_name": "Dashboard Test Client",
        "day": "monday",
        "start_time": "09:00",
        "end_time": "12:00",
        "status": "paid",
        "hourly_rate": 100.0,
        "year": current_year,
        "week": current_week
    }
    
    try:
        response = requests.post(f"{base_url}/planning/events", json=event_data, headers=headers)
        event_result = response.json()
        
        if event_result.get('success'):
            event_id = event_result['event']['id']
            print(f"   ✅ Created test event: {event_id}")
            
            # Create a test task
            task_data = {
                "name": "Dashboard Test Task",
                "price": 75.0,
                "color": "#3b82f6",
                "icon": "📊",
                "time_slots": [{"day": "tuesday", "start": "14:00", "end": "16:00"}],
                "year": current_year,
                "week": current_week
            }
            
            response = requests.post(f"{base_url}/planning/tasks", json=task_data, headers=headers)
            task_result = response.json()
            
            if task_result.get('success'):
                task_id = task_result['task']['id']
                print(f"   ✅ Created test task: {task_id}")
                
                # Now test endpoints with data
                print(f"\n5️⃣ Re-testing endpoints with sample data")
                
                # Test week endpoint with data
                response = requests.get(f"{base_url}/planning/week/{current_year}/{current_week}", headers=headers)
                week_data = response.json()
                print(f"   Week endpoint - Events: {len(week_data.get('events', []))}, Tasks: {len(week_data.get('tasks', []))}")
                
                # Test earnings with data
                response = requests.get(f"{base_url}/planning/earnings/{current_year}/{current_week}", headers=headers)
                earnings_data = response.json()
                earnings = earnings_data.get('earnings', {})
                print(f"   Earnings - Paid: {earnings.get('paid')}, Total: {earnings.get('total')}")
                
                # Expected: Event (3 hours * 100) + Task (2 hours * 75) = 300 + 150 = 450 paid
                expected_paid = 300 + 150  # Event + Task earnings
                actual_paid = earnings.get('paid', 0)
                
                if actual_paid >= expected_paid:
                    print(f"   ✅ Earnings calculation correct (Expected >= {expected_paid}, Got: {actual_paid})")
                else:
                    print(f"   ⚠️ Earnings calculation may be incorrect (Expected >= {expected_paid}, Got: {actual_paid})")
                
                # Cleanup
                requests.delete(f"{base_url}/planning/events/{event_id}", headers=headers)
                requests.delete(f"{base_url}/planning/tasks/{task_id}", headers=headers)
                print(f"   🧹 Cleaned up test data")
                
            else:
                print(f"   ❌ Failed to create test task: {task_result}")
        else:
            print(f"   ❌ Failed to create test event: {event_result}")
            
    except Exception as e:
        print(f"   ❌ Error creating test data: {e}")
    
    print(f"\n✅ Dashboard Planning Endpoints Test Complete")

if __name__ == "__main__":
    test_dashboard_endpoints()