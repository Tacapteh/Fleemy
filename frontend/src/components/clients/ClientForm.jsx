import React, { useState } from 'react';

const ICONS = ['👤','🏢','💼','📞','⭐','💡','📂','📌'];

export default function ClientForm({ initialData = {}, onSubmit, onCancel }) {
  const [firstName, setFirstName] = useState(initialData.first_name || '');
  const [lastName, setLastName] = useState(initialData.last_name || '');
  const [email, setEmail] = useState(initialData.email || '');
  const [phone, setPhone] = useState(initialData.phone || '');
  const [hourlyRate, setHourlyRate] = useState(initialData.hourly_rate || '');
  const [color, setColor] = useState(initialData.color || '#3b82f6');
  const [icon, setIcon] = useState(initialData.icon || ICONS[0]);
  const [applyRate, setApplyRate] = useState(false);
  const isEditing = Boolean(initialData.id);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!firstName || !lastName) return;
    const data = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      hourly_rate: parseFloat(hourlyRate) || 0,
      color,
      icon,
    };
    onSubmit(data, applyRate);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border p-2 rounded"
          placeholder="Prénom"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <input
          className="flex-1 border p-2 rounded"
          placeholder="Nom"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
      </div>
      <input
        className="w-full border p-2 rounded"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full border p-2 rounded"
        placeholder="Téléphone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <div className="flex items-center space-x-2">
        <label className="text-sm">Taux horaire (€)</label>
        <input
          className="border p-2 rounded w-24"
          type="number"
          step="0.01"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
        />
      </div>
      {isEditing && (
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={applyRate}
            onChange={(e) => setApplyRate(e.target.checked)}
          />
          <span>Appliquer le taux à tous les créneaux existants</span>
        </label>
      )}
      <div className="flex items-center space-x-2">
        <label className="text-sm">Couleur</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {ICONS.map((ic) => (
          <button
            type="button"
            key={ic}
            className={`text-xl p-1 rounded ${icon === ic ? 'bg-gray-200' : ''}`}
            onClick={() => setIcon(ic)}
          >
            {ic}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 rounded bg-gray-200">Annuler</button>
        <button type="submit" className="px-3 py-1 rounded bg-blue-500 text-white">{isEditing ? 'Modifier' : 'Ajouter'}</button>
      </div>
    </form>
  );
}
