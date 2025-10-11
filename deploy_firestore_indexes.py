#!/usr/bin/env python3
"""
Script de déploiement des index Firestore pour la collection clients.
Exécute: firebase deploy --only firestore:indexes
"""

import subprocess
import sys

def deploy_indexes():
    """Déploie les index Firestore définis dans firestore.indexes.json"""
    print("🚀 Déploiement des index Firestore...")
    print("=" * 50)
    
    try:
        # Vérifier si firebase-tools est installé
        result = subprocess.run(
            ["firebase", "--version"],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print("❌ Firebase CLI n'est pas installé.")
            print("Installez-le avec: npm install -g firebase-tools")
            sys.exit(1)
        
        print(f"✅ Firebase CLI version: {result.stdout.strip()}")
        
        # Déployer les index
        print("\n📊 Déploiement des index...")
        result = subprocess.run(
            ["firebase", "deploy", "--only", "firestore:indexes"],
            capture_output=True,
            text=True
        )
        
        print(result.stdout)
        
        if result.returncode == 0:
            print("\n✅ Index Firestore déployés avec succès!")
            print("\n📋 Index déployés:")
            print("   - clients(user_id, is_archived)")
            print("   - tasks(user_id, weekly)")
            print("   - tasks(team_id, weekly)")
        else:
            print(f"\n❌ Erreur lors du déploiement:")
            print(result.stderr)
            sys.exit(1)
            
    except FileNotFoundError:
        print("❌ Commande 'firebase' non trouvée.")
        print("Installez Firebase CLI: npm install -g firebase-tools")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Erreur inattendue: {e}")
        sys.exit(1)

if __name__ == "__main__":
    deploy_indexes()
