#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime

class ClientAPITester:
    def __init__(self, base_url="https://visual-update-15.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.test_token = "test-token-123"
        self.headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.test_token}'
        }
        self.tests_run = 0
        self.tests_passed = 0
        self.created_clients = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def test_client_creation(self):
        """Test client creation with various data"""
        print("\n🔍 Testing Client Creation...")
        
        # Test 1: Create client with minimal data
        minimal_client = {
            "display_name": "Test Client Minimal"
        }
        
        try:
            response = requests.post(f"{self.api_url}/clients", json=minimal_client, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'id' in data:
                    self.created_clients.append(data['id'])
                    self.log_test("Create client with minimal data", True, f"Created client ID: {data['id']}")
                else:
                    self.log_test("Create client with minimal data", False, f"No ID in response: {data}")
            else:
                self.log_test("Create client with minimal data", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Create client with minimal data", False, f"Exception: {str(e)}")

        # Test 2: Create client with complete data
        complete_client = {
            "display_name": "Complete Test Client",
            "contact_name": "Jean Dupont",
            "email": "jean.dupont@example.com",
            "phone": "+33 6 12 34 56 78",
            "address": {
                "line1": "123 Rue de la Paix",
                "line2": "Appartement 4B",
                "postal_code": "75001",
                "city": "Paris",
                "country": "France"
            },
            "notes": "Client important avec besoins spécifiques",
            "is_archived": False
        }
        
        try:
            response = requests.post(f"{self.api_url}/clients", json=complete_client, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'id' in data:
                    self.created_clients.append(data['id'])
                    self.log_test("Create client with complete data", True, f"Created client ID: {data['id']}")
                else:
                    self.log_test("Create client with complete data", False, f"No ID in response: {data}")
            else:
                self.log_test("Create client with complete data", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Create client with complete data", False, f"Exception: {str(e)}")

        # Test 3: Test validation - missing display_name
        invalid_client = {
            "contact_name": "No Display Name"
        }
        
        try:
            response = requests.post(f"{self.api_url}/clients", json=invalid_client, headers=self.headers, timeout=10)
            if response.status_code in [400, 422]:  # Accept both 400 and 422 for validation errors
                self.log_test("Create client without display_name (validation)", True, f"Correctly rejected: {response.text}")
            else:
                self.log_test("Create client without display_name (validation)", False, f"Should have been rejected. Status: {response.status_code}")
        except Exception as e:
            self.log_test("Create client without display_name (validation)", False, f"Exception: {str(e)}")

        # Test 4: Test email validation
        invalid_email_client = {
            "display_name": "Invalid Email Client",
            "email": "invalid-email-format"
        }
        
        try:
            response = requests.post(f"{self.api_url}/clients", json=invalid_email_client, headers=self.headers, timeout=10)
            if response.status_code == 400:
                self.log_test("Create client with invalid email (validation)", True, f"Correctly rejected: {response.text}")
            else:
                self.log_test("Create client with invalid email (validation)", False, f"Should have been rejected. Status: {response.status_code}")
        except Exception as e:
            self.log_test("Create client with invalid email (validation)", False, f"Exception: {str(e)}")

        # Test 5: Test phone validation
        invalid_phone_client = {
            "display_name": "Invalid Phone Client",
            "phone": "1234567890"  # Not French format
        }
        
        try:
            response = requests.post(f"{self.api_url}/clients", json=invalid_phone_client, headers=self.headers, timeout=10)
            if response.status_code == 400:
                self.log_test("Create client with invalid phone (validation)", True, f"Correctly rejected: {response.text}")
            else:
                self.log_test("Create client with invalid phone (validation)", False, f"Should have been rejected. Status: {response.status_code}")
        except Exception as e:
            self.log_test("Create client with invalid phone (validation)", False, f"Exception: {str(e)}")

    def test_client_listing(self):
        """Test client listing with pagination and search"""
        print("\n🔍 Testing Client Listing...")
        
        # Test 1: Get all clients
        try:
            response = requests.get(f"{self.api_url}/clients", headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'clients' in data and 'total' in data:
                    self.log_test("Get clients list", True, f"Found {data['total']} clients")
                else:
                    self.log_test("Get clients list", False, f"Invalid response structure: {data}")
            else:
                self.log_test("Get clients list", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Get clients list", False, f"Exception: {str(e)}")

        # Test 2: Test pagination
        try:
            response = requests.get(f"{self.api_url}/clients?page=1&limit=5", headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'clients' in data and 'page' in data and 'limit' in data:
                    self.log_test("Get clients with pagination", True, f"Page {data['page']}, Limit {data['limit']}")
                else:
                    self.log_test("Get clients with pagination", False, f"Invalid pagination response: {data}")
            else:
                self.log_test("Get clients with pagination", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Get clients with pagination", False, f"Exception: {str(e)}")

        # Test 3: Test search
        try:
            response = requests.get(f"{self.api_url}/clients?search=Test", headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if 'clients' in data:
                    self.log_test("Search clients", True, f"Search returned {len(data['clients'])} results")
                else:
                    self.log_test("Search clients", False, f"Invalid search response: {data}")
            else:
                self.log_test("Search clients", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Search clients", False, f"Exception: {str(e)}")

    def test_client_update(self):
        """Test client update functionality"""
        print("\n🔍 Testing Client Update...")
        
        if not self.created_clients:
            print("⚠️ No clients created, skipping update tests")
            return

        client_id = self.created_clients[0]
        
        # Test 1: Update client display name
        update_data = {
            "display_name": "Updated Client Name"
        }
        
        try:
            response = requests.patch(f"{self.api_url}/clients/{client_id}", json=update_data, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('display_name') == "Updated Client Name":
                    self.log_test("Update client display name", True, f"Successfully updated")
                else:
                    self.log_test("Update client display name", False, f"Name not updated: {data}")
            else:
                self.log_test("Update client display name", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("Update client display name", False, f"Exception: {str(e)}")

        # Test 2: Update with invalid email
        invalid_update = {
            "email": "invalid-email"
        }
        
        try:
            response = requests.patch(f"{self.api_url}/clients/{client_id}", json=invalid_update, headers=self.headers, timeout=10)
            if response.status_code in [400, 422]:  # Accept both 400 and 422 for validation errors
                self.log_test("Update client with invalid email (validation)", True, f"Correctly rejected")
            else:
                self.log_test("Update client with invalid email (validation)", False, f"Should have been rejected. Status: {response.status_code}")
        except Exception as e:
            self.log_test("Update client with invalid email (validation)", False, f"Exception: {str(e)}")

        # Test 3: Archive client
        archive_data = {
            "is_archived": True
        }
        
        try:
            response = requests.patch(f"{self.api_url}/clients/{client_id}", json=archive_data, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('is_archived') == True:
                    self.log_test("Archive client", True, f"Successfully archived")
                else:
                    self.log_test("Archive client", False, f"Not archived: {data}")
            else:
                self.log_test("Archive client", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Archive client", False, f"Exception: {str(e)}")

    def test_client_delete(self):
        """Test client deletion (soft delete)"""
        print("\n🔍 Testing Client Deletion...")
        
        if len(self.created_clients) < 2:
            print("⚠️ Not enough clients created, skipping delete tests")
            return

        client_id = self.created_clients[1]
        
        try:
            response = requests.delete(f"{self.api_url}/clients/{client_id}", headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('success') == True:
                    self.log_test("Delete client (soft delete)", True, f"Successfully deleted/archived")
                else:
                    self.log_test("Delete client (soft delete)", False, f"Delete failed: {data}")
            else:
                self.log_test("Delete client (soft delete)", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Delete client (soft delete)", False, f"Exception: {str(e)}")

    def test_client_edge_cases(self):
        """Test edge cases and error handling"""
        print("\n🔍 Testing Client Edge Cases...")
        
        # Test 1: Update non-existent client
        try:
            response = requests.patch(f"{self.api_url}/clients/non-existent-id", 
                                    json={"display_name": "Test"}, headers=self.headers, timeout=10)
            if response.status_code == 404:
                self.log_test("Update non-existent client", True, f"Correctly returned 404")
            else:
                self.log_test("Update non-existent client", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Update non-existent client", False, f"Exception: {str(e)}")

        # Test 2: Delete non-existent client
        try:
            response = requests.delete(f"{self.api_url}/clients/non-existent-id", headers=self.headers, timeout=10)
            if response.status_code == 404:
                self.log_test("Delete non-existent client", True, f"Correctly returned 404")
            else:
                self.log_test("Delete non-existent client", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Delete non-existent client", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all client API tests"""
        print("🚀 Starting Client Management API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Run all test suites
        test_suites = [
            self.test_client_creation,
            self.test_client_listing,
            self.test_client_update,
            self.test_client_delete,
            self.test_client_edge_cases,
        ]
        
        for test_suite in test_suites:
            try:
                test_suite()
            except Exception as e:
                print(f"❌ Test suite failed with exception: {str(e)}")
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 CLIENT API TEST SUMMARY")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.created_clients:
            print(f"Created {len(self.created_clients)} test clients: {self.created_clients}")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All client API tests passed!")
            return 0
        else:
            print("⚠️  Some client API tests failed. Check the details above.")
            return 1

def main():
    """Main function to run the client API tests"""
    tester = ClientAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())