import React, { useState, useRef, useEffect } from 'react';

/**
 * Combobox accessible avec recherche et sélection
 * Supporte navigation clavier et ARIA
 */
export default function Combobox({
  options = [],
  value,
  onChange,
  onSelect,
  onSearchChange,
  placeholder = 'Rechercher...',
  displayField = 'display_name',
  valueField = 'id',
  disabled = false,
  error = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filtrer les options basées sur la recherche
  const filteredOptions = options.filter(option => {
    const displayValue = option[displayField] || '';
    return displayValue.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Trouver l'option sélectionnée
  const selectedOption = options.find(opt => opt[valueField] === value);

  useEffect(() => {
    if (selectedOption) {
      setSearchTerm(selectedOption[displayField] || '');
    }
  }, [selectedOption, displayField]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setIsOpen(true);
    setHighlightedIndex(0);
    if (onSearchChange) onSearchChange(newValue);
  };

  const handleSelectOption = (option) => {
    setSearchTerm(option[displayField] || '');
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (onChange) onChange(option[valueField], option);
    if (onSelect) onSelect(option);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleBlur = (e) => {
    // Delay to allow click on option
    setTimeout(() => {
      if (!listRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        // Reset to selected value if exists
        if (selectedOption) {
          setSearchTerm(selectedOption[displayField] || '');
        }
      }
    }, 200);
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => !disabled && setIsOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || error ? 'true' : 'false'}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="combobox-listbox"
        data-testid={testId}
        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
      />
      
      {isOpen && filteredOptions.length > 0 && !disabled && (
        <ul
          ref={listRef}
          id="combobox-listbox"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredOptions.map((option, index) => (
            <li
              key={option[valueField]}
              role="option"
              aria-selected={option[valueField] === value}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectOption(option);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer ${
                highlightedIndex === index ? 'bg-blue-100' : ''
              } ${
                option[valueField] === value ? 'bg-blue-50 font-semibold' : ''
              } hover:bg-blue-100`}
            >
              {option[displayField]}
            </li>
          ))}
        </ul>
      )}
      
      {isOpen && filteredOptions.length === 0 && searchTerm && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-3 text-gray-500 text-sm">
          Aucun résultat trouvé
        </div>
      )}
    </div>
  );
}
