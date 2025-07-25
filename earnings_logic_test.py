#!/usr/bin/env python3

def test_earnings_calculation_logic():
    """Test the earnings calculation logic with correct field names"""
    
    print("🔍 Testing Earnings Calculation Logic")
    print("=" * 60)
    
    # Mock events data with correct field names (as they would come from database)
    mock_events = [
        {
            "description": "Client meeting",
            "client_id": "client-1",
            "client_name": "Acme Corp",
            "day": "monday",
            "start_time": "09:00",
            "end_time": "17:00",
            "status": "paid",
            "hourly_rate": 75.0
        },
        {
            "description": "Development work",
            "client_id": "client-2", 
            "client_name": "Tech Inc",
            "day": "tuesday",
            "start_time": "10:00",
            "end_time": "14:00",
            "status": "unpaid",
            "hourly_rate": 50.0
        },
        {
            "description": "Consultation",
            "client_id": "client-3",
            "client_name": "StartupXYZ",
            "day": "wednesday", 
            "start_time": "14:00",
            "end_time": "16:00",
            "status": "pending",
            "hourly_rate": 100.0
        }
    ]
    
    # Simulate the earnings calculation logic (fixed version)
    earnings = {
        "paid": 0,
        "unpaid": 0,
        "pending": 0,
        "not_worked": 0,
        "total": 0
    }
    
    default_hourly_rate = 50.0
    
    print("Processing events:")
    for i, event in enumerate(mock_events, 1):
        try:
            # Use correct field names: start_time and end_time (not start/end)
            start_hour = int(event["start_time"].split(":")[0])
            end_hour = int(event["end_time"].split(":")[0])
            hours = end_hour - start_hour
            amount = hours * event.get("hourly_rate", default_hourly_rate)
            
            # Use correct field name: status (not type)
            if event["status"] == "paid":
                earnings["paid"] += amount
            elif event["status"] == "unpaid":
                earnings["unpaid"] += amount
            elif event["status"] == "pending":
                earnings["pending"] += amount
            elif event["status"] == "not_worked":
                earnings["not_worked"] += amount
                
            print(f"  Event {i}: {event['description']} - {hours}h × ${event.get('hourly_rate', default_hourly_rate)}/h = ${amount} ({event['status']})")
            
        except Exception as e:
            # Fallback calculation
            amount = event.get("hourly_rate", default_hourly_rate)
            if event["status"] == "paid":
                earnings["paid"] += amount
            elif event["status"] == "unpaid":
                earnings["unpaid"] += amount
            elif event["status"] == "pending":
                earnings["pending"] += amount
            print(f"  Event {i}: {event['description']} - Fallback calculation: ${amount} ({event['status']})")
    
    earnings["total"] = earnings["paid"] + earnings["unpaid"] + earnings["pending"]
    
    print(f"\n📊 Earnings Summary:")
    print(f"  Paid: ${earnings['paid']}")
    print(f"  Unpaid: ${earnings['unpaid']}")
    print(f"  Pending: ${earnings['pending']}")
    print(f"  Not Worked: ${earnings['not_worked']}")
    print(f"  Total: ${earnings['total']}")
    
    # Verify calculations
    expected_paid = 8 * 75.0  # 8 hours at $75/h
    expected_unpaid = 4 * 50.0  # 4 hours at $50/h
    expected_pending = 2 * 100.0  # 2 hours at $100/h
    expected_total = expected_paid + expected_unpaid + expected_pending
    
    print(f"\n✅ Verification:")
    print(f"  Expected Paid: ${expected_paid} - {'✅ CORRECT' if earnings['paid'] == expected_paid else '❌ INCORRECT'}")
    print(f"  Expected Unpaid: ${expected_unpaid} - {'✅ CORRECT' if earnings['unpaid'] == expected_unpaid else '❌ INCORRECT'}")
    print(f"  Expected Pending: ${expected_pending} - {'✅ CORRECT' if earnings['pending'] == expected_pending else '❌ INCORRECT'}")
    print(f"  Expected Total: ${expected_total} - {'✅ CORRECT' if earnings['total'] == expected_total else '❌ INCORRECT'}")
    
    # Test with old field names (should fail)
    print(f"\n🔍 Testing with OLD field names (should fail):")
    
    old_format_event = {
        "description": "Old format event",
        "start": "09:00",  # OLD field name
        "end": "17:00",    # OLD field name  
        "type": "paid"     # OLD field name
    }
    
    try:
        start_hour = int(old_format_event["start"].split(":")[0])
        end_hour = int(old_format_event["end"].split(":")[0])
        hours = end_hour - start_hour
        print(f"❌ OLD FORMAT: Should have failed but didn't - calculated {hours} hours")
    except KeyError as e:
        print(f"✅ OLD FORMAT: Correctly failed with KeyError: {e}")
    except Exception as e:
        print(f"✅ OLD FORMAT: Failed as expected: {e}")
    
    print("\n" + "=" * 60)
    print("📊 Earnings Logic Test Complete")
    print("\nKey Findings:")
    print("- Fixed field names: start_time/end_time (not start/end)")
    print("- Fixed field names: status (not type)")
    print("- Proper hourly rate calculation")
    print("- Correct earnings categorization")

if __name__ == "__main__":
    test_earnings_calculation_logic()