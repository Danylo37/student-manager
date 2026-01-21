import React from 'react';
import DatePicker from 'react-datepicker';
import { uk } from 'date-fns/locale';
import { setHours, setMinutes } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';
import './DateTimePicker.css';

/**
 * Custom DateTimePicker with Ukrainian locale
 */
function DateTimePicker({ value, onChange, showTimeSelect = false, className = '' }) {
    const handleChange = (date) => {
        if (onChange) {
            onChange(date);
        }
    };

    return (
        <DatePicker
            selected={value}
            onChange={handleChange}
            showTimeSelect={showTimeSelect}
            timeFormat="HH:mm"
            timeIntervals={15}
            dateFormat={showTimeSelect ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy'}
            locale={uk}
            className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
            calendarClassName="custom-calendar"
        />
    );
}

/**
 * Separate Date Picker
 */
export function DatePickerInput({ value, onChange, className = '' }) {
    return (
        <DateTimePicker
            value={value}
            onChange={onChange}
            showTimeSelect={false}
            className={className}
        />
    );
}

/**
 * Separate Time Picker with time restrictions (9:00 - 20:00)
 */
export function TimePickerInput({ value, onChange, className = '' }) {
    // Set min time to 9:00
    const minTime = setHours(setMinutes(new Date(), 45), 8);
    // Set max time to 20:00
    const maxTime = setHours(setMinutes(new Date(), 0), 20);

    return (
        <DatePicker
            selected={value}
            onChange={onChange}
            showTimeSelect
            showTimeSelectOnly
            timeIntervals={15}
            timeCaption="Час"
            dateFormat="HH:mm"
            locale={uk}
            minTime={minTime}
            maxTime={maxTime}
            className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
        />
    );
}
