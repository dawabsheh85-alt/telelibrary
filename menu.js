// This file defines the entire menu structure and logic for the bot.

const MENU_DATA = {
    initial: {
        text: '🎉 أهلاً بك في المكتبة التعليمية! 🎉\n\nاختر أحد الفصول للبدء.',
        buttons: [
            { text: 'الفصل الأول F1 📚', callback_data: 'initial:chapter1' },
            { text: 'الفصل الثاني F2 📖', callback_data: 'initial:chapter2' },
            { text: 'الفصل الثالث F3 📘', callback_data: 'initial:chapter3' },
            { text: 'الآلة الحاسبة 🧮', callback_data: 'initial:calculator_menu' },
            { text: 'الاستفسارات ❓', callback_data: 'initial:inquiries' },
        ],
        layout: [2, 2, 1]
    },
    inquiries: {
        text: 'للاستفسارات أو الدعم الفني، يرجى التواصل عبر:\n\n📧 البريد الإلكتروني:\nM.DAWABSHEH85@gmail.com\n\n📞 رقم الهاتف:\n971526752603',
        buttons: [],
        layout: []
    },
    grades: {
        text: 'يرجى اختيار الصف الدراسي:',
        buttons: [
            { text: 'الصف الخامس G5', callback_data: 'grade5' },
            { text: 'الصف السادس G6', callback_data: 'grade6' },
            { text: 'الصف السابع G7', callback_data: 'grade7' },
            { text: 'الصف الثامن G8', callback_data: 'grade8' },
            { text: 'الصف التاسع G9', callback_data: 'grade9' },
            { text: 'الصف العاشر G10', callback_data: 'grade10' },
            { text: 'الحادي عشر G11', callback_data: 'grade11' },
            { text: 'الثاني عشر G12', callback_data: 'grade12' },
        ],
        layout: [2, 2, 2, 2]
    },
    tracks: {
        text: 'يرجى اختيار المسار:',
        buttons: [
            { text: 'المسار المتقدم 🚀', callback_data: 'advanced' },
            { text: 'المسار العام 🛣️', callback_data: 'general' },
        ],
        layout: [2]
    },
    subjects_5_10: {
        text: 'يرجى اختيار المادة:',
        buttons: [
            { text: 'العلوم 🧪', callback_data: 'science' },
            { text: 'الرياضيات 📐', callback_data: 'math' },
        ],
        layout: [2]
    },
    subjects_11_12: {
        text: 'يرجى اختيار المادة:',
        buttons: [
            { text: 'الرياضيات 📐', callback_data: 'math' },
            { text: 'الفيزياء ⚛️', callback_data: 'physics' },
            { text: 'الكيمياء 🔬', callback_data: 'chemistry' },
            { text: 'الأحياء 🧬', callback_data: 'biology' },
        ],
        layout: [2, 2]
    },
    language: {
        text: 'يرجى اختيار لغة المحتوى:',
        buttons: [
            { text: 'عربي 🇦🇪', callback_data: 'arabic' },
            { text: 'English 🇬🇧', callback_data: 'english' },
        ],
        layout: [2]
    },
    material_types: {
        text: 'يرجى اختيار نوع المادة:',
        buttons: [
            { text: 'ملازم | Malazem', callback_data: 'malazem' },
            { text: 'هياكل سابقة | Structures', callback_data: 'structures' },
            { text: 'أوراق عمل | Worksheets', callback_data: 'worksheets' },
            { text: 'امتحانات سابقة | Exams', callback_data: 'previous_exams' },
            { text: 'دليل المعلم | Teacher Guide', callback_data: 'teacher_guide' },
            { text: 'كتاب المعلم | Teacher Book', callback_data: 'teacher_book' },
            { text: 'شروحات للدروس | Explanations', callback_data: 'explanations' },
        ],
        layout: [1, 1, 1, 1, 1, 1, 1]
    }
};

const getMenuDataForPath = (pathKey) => {
    const pathParts = pathKey.split(':');
    if (pathKey === 'initial') return MENU_DATA.initial;
    
    // Navigate through the menu structure based on the path
    if (pathParts.length >= 2) { // e.g., initial:chapter1 -> grades
        if (pathParts[1] === 'calculator_menu' || pathParts[1] === 'inquiries') return null; // These have custom handlers
        return MENU_DATA.grades;
    }
    // This function can be expanded, but for now, we determine the menu type in the main getKeyboard function
    return null;
}

const getKeyboard = (pathKey, userId, isAdmin, filesDB, userState) => {
    const currentState = userState[userId] || {};
    const effectivePath = pathKey || 'initial';

    // --- Handle special states (awaiting files, delete mode) first ---
    if (effectivePath.endsWith(':awaiting_files_bulk')) {
        return {
            text: "أنت الآن في وضع الرفع الجماعي. 📂\nأرسل أي عدد من الملفات التي تريدها.\nعند الانتهاء، اضغط على زر '✅ تم الانتهاء' أدناه.",
            keyboard: [[{ text: '✅ تم الانتهاء', callback_data: 'finish_bulk_upload' }]],
            parse_mode: 'Markdown'
        };
    }
    
    if (effectivePath.endsWith(':delete_mode')) {
        const filesPath = effectivePath.replace(':delete_mode', '');
        const files = filesDB[filesPath] || [];
        const pendingDeletions = currentState.pendingDeletions || [];

        const fileButtons = files.map((file, index) => {
            if (pendingDeletions.includes(index)) {
                // Marked for deletion: show undo option
                return [{
                    text: `↩️ ~${file.file_name}~`,
                    callback_data: `UNDOMARK_DELETE::${index}`
                }];
            } else {
                // Not marked: show delete option
                return [{
                    text: `🗑️ ${file.file_name}`,
                    callback_data: `MARK_DELETE::${index}`
                }];
            }
        });

        const actionButtons = [];
        if (pendingDeletions.length > 0) {
            actionButtons.push({ text: '✅ تأكيد الحذف النهائي', callback_data: 'CONFIRM_DELETE' });
        }
        actionButtons.push({ text: '❌ إلغاء', callback_data: 'cancel_delete' });

        return {
            text: 'وضع الحذف 🗑️\n\n- اضغط على ملف لتحديده للحذف.\n- اضغط مرة أخرى لإلغاء التحديد.\n- اضغط على "تأكيد" لحذف الملفات المحددة نهائياً.',
            keyboard: [
                ...fileButtons,
                actionButtons
            ],
            parse_mode: 'Markdown'
        };
    }

    // --- Regular Menu Logic ---
    const pathParts = effectivePath.split(':');
    let text, staticButtons, layout;
    let isFilesMenu = false;

    // Determine current menu level based on path
    if (effectivePath === 'initial') {
        ({ text, buttons: staticButtons, layout } = MENU_DATA.initial);
    } else if (pathParts.includes('calculator_menu')) {
        isFilesMenu = true;
        text = 'قسم الآلة الحاسبة 🧮';
    } else if (pathParts.includes('inquiries')) {
        ({ text, buttons: staticButtons, layout } = MENU_DATA.inquiries);
    } else {
        const grade = pathParts[2];
        const isHighSchool = ['grade11', 'grade12'].includes(grade);

        switch (pathParts.length) {
            case 2: ({ text, buttons: staticButtons, layout } = MENU_DATA.grades); break;
            case 3: ({ text, buttons: staticButtons, layout } = isHighSchool ? MENU_DATA.tracks : MENU_DATA.subjects_5_10); break;
            case 4: ({ text, buttons: staticButtons, layout } = isHighSchool ? MENU_DATA.subjects_11_12 : MENU_DATA.language); break;
            case 5: ({ text, buttons: staticButtons, layout } = isHighSchool ? MENU_DATA.language : MENU_DATA.material_types); break;
            case 6:
                if (isHighSchool) ({ text, buttons: staticButtons, layout } = MENU_DATA.material_types);
                else {
                    isFilesMenu = true;
                    text = `ملفات: ${MENU_DATA.material_types.buttons.find(b => b.callback_data === pathParts[5])?.text || pathParts[5]}`;
                }
                break;
            case 7:
                if (isHighSchool) {
                    isFilesMenu = true;
                    text = `ملفات: ${MENU_DATA.material_types.buttons.find(b => b.callback_data === pathParts[6])?.text || pathParts[6]}`;
                }
                break;
            default:
                ({ text, buttons: staticButtons, layout } = MENU_DATA.initial);
        }
    }
    
    let finalButtons = [];
    if (isFilesMenu) {
        const files = filesDB[effectivePath] || [];
        text += files.length === 0 ? '\n\nالمجلد فارغ حالياً.' : '\n\nاختر الملف للتحميل:';
        
        finalButtons = files.map((file, index) => ({
            text: `📄 ${file.file_name}`,
            callback_data: `DOWNLOAD::${index}`
        }));

        if (isAdmin) {
            finalButtons.push({ text: '➕ إضافة ملف', callback_data: 'add_file_prompt' });
            if (files.length > 0) {
                finalButtons.push({ text: '🗑️ حذف ملف', callback_data: 'delete_file_prompt' });
            }
        }
    } else {
        finalButtons = [...(staticButtons || [])];
    }
    
    // --- Add Navigation Controls ---
    if (effectivePath !== 'initial') {
        finalButtons.push({ text: '🔙 رجوع', callback_data: 'back' });
        finalButtons.push({ text: '🏠 القائمة الرئيسية', callback_data: 'initial' });
    }

    // --- Build final keyboard layout ---
    let finalKeyboard = [];
    if (isFilesMenu) {
        // For file menus, create a simple one-button-per-row layout for files,
        // then a two-button row for admin controls if they exist.
        const fileButtons = finalButtons.filter(b => b.callback_data.startsWith('DOWNLOAD'));
        const adminButtons = finalButtons.filter(b => !b.callback_data.startsWith('DOWNLOAD') && !['back', 'initial'].includes(b.callback_data));
        const navButtons = finalButtons.filter(b => ['back', 'initial'].includes(b.callback_data));

        fileButtons.forEach(btn => finalKeyboard.push([btn]));
        if(adminButtons.length > 0) finalKeyboard.push(adminButtons);
        if(navButtons.length > 0) finalKeyboard.push(navButtons);

    } else {
        // Use the predefined layout for static menus
        let buttonIndex = 0;
        const navButtonCount = effectivePath === 'initial' ? 0 : 2;
        const mainButtons = finalButtons.slice(0, finalButtons.length - navButtonCount);
        const navButtons = finalButtons.slice(finalButtons.length - navButtonCount);

        for (const rowSize of (layout || [])) {
            let currentRow = [];
            for (let i = 0; i < rowSize; i++) {
                if (mainButtons[buttonIndex]) {
                    currentRow.push(mainButtons[buttonIndex]);
                    buttonIndex++;
                }
            }
            if (currentRow.length > 0) {
                finalKeyboard.push(currentRow);
            }
        }
        if (navButtons.length > 0) {
            finalKeyboard.push(navButtons);
        }
    }

    return { text, keyboard: finalKeyboard, parse_mode: 'Markdown' };
};

module.exports = { getKeyboard };
