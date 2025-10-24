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
    <form
      onSubmit={handleSubmit}
      className="space-y-4 text-slate-900 dark:text-slate-100"
      aria-label="Formulaire client"
    >
      <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">
        {isEditing ? 'Modifier le client' : 'Nouveau client'}
      </h2>

      {/* Display Name - Obligatoire */}
      <div>
        <label
          htmlFor="display_name"
          className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Nom d'affichage <span className="text-red-500">*</span>
        </label>
        <input
          id="display_name"
          type="text"
          className={`w-full rounded border p-2 bg-white text-slate-900 placeholder:text-slate-400 transition-colors dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            errors.displayName ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
          }`}
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
        <label
          htmlFor="contact_name"
          className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Nom du contact
        </label>
        <input
          id="contact_name"
          type="text"
          className="w-full rounded border border-gray-300 bg-white p-2 text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder="Ex: Jean Dupont"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          data-testid="client-contact-name"
        />
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          className={`w-full rounded border p-2 bg-white text-slate-900 placeholder:text-slate-400 transition-colors dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            errors.email ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
          }`}
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
        <label
          htmlFor="phone"
          className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Téléphone
        </label>
        <input
          id="phone"
          type="tel"
          className={`w-full rounded border p-2 bg-white text-slate-900 placeholder:text-slate-400 transition-colors dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            errors.phone ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
          }`}
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
      <fieldset className="space-y-3 rounded border border-gray-200 p-3 dark:border-slate-700">
        <legend className="px-2 text-sm font-medium text-slate-900 dark:text-slate-100">Adresse</legend>

        <div>
          <label
            htmlFor="address_line1"
            className="mb-1 block text-sm text-slate-900 dark:text-slate-100"
          >
            Adresse ligne 1
          </label>
          <input
            id="address_line1"
            type="text"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Numéro et nom de rue"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            data-testid="client-address-line1"
          />
        </div>

        <div>
          <label
            htmlFor="address_line2"
            className="mb-1 block text-sm text-slate-900 dark:text-slate-100"
          >
            Adresse ligne 2
          </label>
          <input
            id="address_line2"
            type="text"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="Complément d'adresse"
            value={line2}
            onChange={(e) => setLine2(e.target.value)}
            data-testid="client-address-line2"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="postal_code"
              className="mb-1 block text-sm text-slate-900 dark:text-slate-100"
            >
              Code postal
            </label>
            <input
              id="postal_code"
              type="text"
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="75001"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              data-testid="client-postal-code"
            />
          </div>
          <div>
            <label
              htmlFor="city"
              className="mb-1 block text-sm text-slate-900 dark:text-slate-100"
            >
              Ville
            </label>
            <input
              id="city"
              type="text"
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="Paris"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              data-testid="client-city"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="country"
            className="mb-1 block text-sm text-slate-900 dark:text-slate-100"
          >
            Pays
          </label>
          <input
            id="country"
            type="text"
            className="w-full rounded border border-gray-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="France"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            data-testid="client-country"
          />
        </div>
      </fieldset>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="mb-1 block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Notes
        </label>
        <textarea
          id="notes"
          className="w-full rounded border border-gray-300 bg-white p-2 text-slate-900 placeholder:text-slate-400 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
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
          className="rounded bg-gray-200 px-4 py-2 transition-colors hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600"
          data-testid="client-form-cancel"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="rounded bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
          data-testid="client-form-submit"
        >
          {isEditing ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}
