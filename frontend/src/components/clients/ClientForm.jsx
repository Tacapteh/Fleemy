import React, { useState } from 'react';

export default function ClientForm({ initialData = {}, onSubmit, onCancel }) {
  const [displayName, setDisplayName] = useState(initialData.display_name || '');
  const [contactName, setContactName] = useState(initialData.contact_name || '');
  const [email, setEmail] = useState(initialData.email || '');
  const [phone, setPhone] = useState(initialData.phone || '');
  const [notes, setNotes] = useState(initialData.notes || '');
  
  // Address fields
  const [line1, setLine1] = useState(initialData.address?.line1 || '');
  const [line2, setLine2] = useState(initialData.address?.line2 || '');
  const [postalCode, setPostalCode] = useState(initialData.address?.postal_code || '');
  const [city, setCity] = useState(initialData.address?.city || '');
  const [country, setCountry] = useState(initialData.address?.country || 'France');
  
  // Validation errors
  const [errors, setErrors] = useState({});
  
  const isEditing = Boolean(initialData.id);

  const validateForm = () => {
    const newErrors = {};
    
    // display_name obligatoire
    if (!displayName.trim()) {
      newErrors.displayName = 'Le nom d\'affichage est obligatoire';
    }
    
    // Validation email (format simple)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Format d\'email invalide';
    }
    
    // Validation téléphone français
    if (phone) {
      const cleanedPhone = phone.replace(/[\s\.\-]/g, '');
      if (!/^(?:(?:\+|00)33|0)[1-9](?:\d{8})$/.test(cleanedPhone)) {
        newErrors.phone = 'Format de téléphone français invalide (ex: 06 12 34 56 78)';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const data = {
      display_name: displayName.trim(),
      contact_name: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      address: line1.trim() ? {
        line1: line1.trim(),
        line2: line2.trim(),
        postal_code: postalCode.trim(),
        city: city.trim(),
        country: country.trim()
      } : null
    };
    
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Formulaire client">
      <h2 className="text-xl font-bold mb-4">
        {isEditing ? 'Modifier le client' : 'Nouveau client'}
      </h2>
      
      {/* Display Name - Obligatoire */}
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium mb-1">
          Nom d'affichage <span className="text-red-500">*</span>
        </label>
        <input
          id="display_name"
          type="text"
          className={`w-full border p-2 rounded ${errors.displayName ? 'border-red-500' : 'border-gray-300'}`}
          placeholder="Ex: Entreprise ACME, Jean Dupont..."
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (errors.displayName) setErrors({...errors, displayName: undefined});
          }}
          required
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'display_name-error' : undefined}
          data-testid="client-display-name"
        />
        {errors.displayName && (
          <p id="display_name-error" className="text-red-500 text-sm mt-1" role="alert" aria-live="polite">
            {errors.displayName}
          </p>
        )}
      </div>

      {/* Contact Name - Optionnel */}
      <div>
        <label htmlFor="contact_name" className="block text-sm font-medium mb-1">
          Nom du contact
        </label>
        <input
          id="contact_name"
          type="text"
          className="w-full border border-gray-300 p-2 rounded"
          placeholder="Ex: Jean Dupont"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          data-testid="client-contact-name"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          className={`w-full border p-2 rounded ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
          placeholder="email@exemple.fr"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors({...errors, email: undefined});
          }}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          data-testid="client-email"
        />
        {errors.email && (
          <p id="email-error" className="text-red-500 text-sm mt-1" role="alert" aria-live="polite">
            {errors.email}
          </p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium mb-1">
          Téléphone
        </label>
        <input
          id="phone"
          type="tel"
          className={`w-full border p-2 rounded ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
          placeholder="06 12 34 56 78"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (errors.phone) setErrors({...errors, phone: undefined});
          }}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          data-testid="client-phone"
        />
        {errors.phone && (
          <p id="phone-error" className="text-red-500 text-sm mt-1" role="alert" aria-live="polite">
            {errors.phone}
          </p>
        )}
      </div>

      {/* Address Section */}
      <fieldset className="border border-gray-200 rounded p-3 space-y-3">
        <legend className="text-sm font-medium px-2">Adresse</legend>
        
        <div>
          <label htmlFor="address_line1" className="block text-sm mb-1">Adresse ligne 1</label>
          <input
            id="address_line1"
            type="text"
            className="w-full border border-gray-300 p-2 rounded text-sm"
            placeholder="Numéro et nom de rue"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            data-testid="client-address-line1"
          />
        </div>
        
        <div>
          <label htmlFor="address_line2" className="block text-sm mb-1">Adresse ligne 2</label>
          <input
            id="address_line2"
            type="text"
            className="w-full border border-gray-300 p-2 rounded text-sm"
            placeholder="Complément d'adresse"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            data-testid="client-address-line2"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="postal_code" className="block text-sm mb-1">Code postal</label>
            <input
              id="postal_code"
              type="text"
              className="w-full border border-gray-300 p-2 rounded text-sm"
              placeholder="75001"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              data-testid="client-postal-code"
            />
          </div>
          <div>
            <label htmlFor="city" className="block text-sm mb-1">Ville</label>
            <input
              id="city"
              type="text"
              className="w-full border border-gray-300 p-2 rounded text-sm"
              placeholder="Paris"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              data-testid="client-city"
            />
          </div>
        </div>
        
        <div>
          <label htmlFor="country" className="block text-sm mb-1">Pays</label>
          <input
            id="country"
            type="text"
            className="w-full border border-gray-300 p-2 rounded text-sm"
            placeholder="France"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            data-testid="client-country"
          />
        </div>
      </fieldset>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          className="w-full border border-gray-300 p-2 rounded"
          placeholder="Notes supplémentaires..."
          rows="3"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="client-notes"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <button 
          type="button" 
          onClick={onCancel} 
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 transition-colors"
          data-testid="client-form-cancel"
        >
          Annuler
        </button>
        <button 
          type="submit" 
          className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          data-testid="client-form-submit"
        >
          {isEditing ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
