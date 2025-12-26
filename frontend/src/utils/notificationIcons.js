import {
    DollarSign,
    FileText,
    Calendar,
    Bell,
    User,
    Settings,
    CheckCircle,
    AlertTriangle,
    XCircle,
    Info,
} from 'lucide-react';

/**
 * Maps notification types to their corresponding Lucide React icons
 */
export const notificationIcons = {
    payment: DollarSign,
    devis: FileText,
    planning: Calendar,
    rappel: Bell,
    client: User,
    system: Settings,
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
    info: Info,
};

/**
 * Get the icon component for a notification type
 * @param {string} type - The notification type
 * @returns {React.Component} The icon component
 */
export const getNotificationIcon = (type) => {
    if (!type || typeof type !== 'string') {
        return Info;
    }

    const normalizedType = type.toLowerCase().trim();
    return notificationIcons[normalizedType] || Info;
};

/**
 * Get the color classes for a notification type
 * @param {string} type - The notification type
 * @returns {object} Object containing background and text color classes
 */
export const getNotificationColors = (type) => {
    const colorMap = {
        payment: {
            bg: 'bg-emerald-500/10',
            text: 'text-emerald-400',
            border: 'border-emerald-500/30',
            dot: 'bg-emerald-400',
        },
        devis: {
            bg: 'bg-blue-500/10',
            text: 'text-blue-400',
            border: 'border-blue-500/30',
            dot: 'bg-blue-400',
        },
        planning: {
            bg: 'bg-purple-500/10',
            text: 'text-purple-400',
            border: 'border-purple-500/30',
            dot: 'bg-purple-400',
        },
        rappel: {
            bg: 'bg-amber-500/10',
            text: 'text-amber-400',
            border: 'border-amber-500/30',
            dot: 'bg-amber-400',
        },
        client: {
            bg: 'bg-cyan-500/10',
            text: 'text-cyan-400',
            border: 'border-cyan-500/30',
            dot: 'bg-cyan-400',
        },
        system: {
            bg: 'bg-slate-500/10',
            text: 'text-slate-400',
            border: 'border-slate-500/30',
            dot: 'bg-slate-400',
        },
        success: {
            bg: 'bg-green-500/10',
            text: 'text-green-400',
            border: 'border-green-500/30',
            dot: 'bg-green-400',
        },
        warning: {
            bg: 'bg-orange-500/10',
            text: 'text-orange-400',
            border: 'border-orange-500/30',
            dot: 'bg-orange-400',
        },
        error: {
            bg: 'bg-red-500/10',
            text: 'text-red-400',
            border: 'border-red-500/30',
            dot: 'bg-red-400',
        },
        info: {
            bg: 'bg-sky-500/10',
            text: 'text-sky-400',
            border: 'border-sky-500/30',
            dot: 'bg-sky-400',
        },
    };

    const normalizedType = type?.toLowerCase().trim();
    return colorMap[normalizedType] || colorMap.info;
};

export default {
    getNotificationIcon,
    getNotificationColors,
    notificationIcons,
};
