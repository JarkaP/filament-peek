const debounce = require('lodash.debounce');

import { dispatch } from 'alpinejs/src/utils/dispatch';

const editorFocusOutHandlers = [];

const Peek = {
    onEditorFocusOut(callback) {
        editorFocusOutHandlers.push(callback);
    },
};

const resizerState = {
    initialWidth: 0,
    initialX: 0,
};

document.addEventListener('alpine:init', () => {
    dispatch(document, 'peek:initializing');

    Alpine.data('PeekPreviewModal', (config) => ({
        config,
        isOpen: false,
        withEditor: false,
        editorHasSidebarActions: false,
        editorIsResizable: false,
        editorIsResizing: false,
        canRotatePreset: false,
        activeDevicePreset: null,
        editorTitle: null,
        modalTitle: null,
        iframeUrl: null,
        iframeContent: null,
        modalStyle: {
            display: 'none',
        },
        iframeStyle: {
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
        },
        editorStyle: {
            display: 'none',
        },

        init() {
            const debounceTime = this.config.editorAutoRefreshDebounceTime || 500;
            const editorSidebarMinWidth = this.config.editorSidebarMinWidth || '30rem';
            const editorSidebarInitialWidth = this.config.editorSidebarInitialWidth || '30rem';

            this.refreshBuilderPreview = debounce(() => Livewire.emit('refreshBuilderPreview'), debounceTime);

            this.editorStyle.width = editorSidebarInitialWidth;

            if (this.config.canResizeEditorSidebar) {
                this.editorStyle.minWidth = editorSidebarMinWidth;
                this.editorIsResizable = true;
            }

            this.setDevicePreset();
        },

        setIframeDimensions(width, height) {
            this.iframeStyle.maxWidth = width;
            this.iframeStyle.maxHeight = height;

            if (this.config.allowIframeOverflow) {
                this.iframeStyle.width = width;
                this.iframeStyle.height = height;
            }
        },

        setDevicePreset(name) {
            name = name || this.config.initialDevicePreset;

            if (!this.config.devicePresets) return;
            if (!this.config.devicePresets[name]) return;
            if (!this.config.devicePresets[name].width) return;
            if (!this.config.devicePresets[name].height) return;

            this.setIframeDimensions(this.config.devicePresets[name].width, this.config.devicePresets[name].height);

            this.canRotatePreset = this.config.devicePresets[name].canRotatePreset || false;

            this.activeDevicePreset = name;
        },

        isActiveDevicePreset(name) {
            if (!this.config.shouldShowActiveDevicePreset) {
                return false;
            }

            return this.activeDevicePreset === name;
        },

        rotateDevicePreset() {
            const newMaxWidth = this.iframeStyle.maxHeight;
            const newMaxHeight = this.iframeStyle.maxWidth;

            this.setIframeDimensions(newMaxWidth, newMaxHeight);
        },

        onOpenPreviewModal($event) {
            document.body.classList.add('is-filament-peek-preview-modal-open');

            this.withEditor = !!$event.detail.withEditor;
            this.editorHasSidebarActions = !!$event.detail.editorHasSidebarActions;
            this.editorIsResizing = false;
            this.editorTitle = $event.detail.editorTitle;
            this.editorStyle.display = this.withEditor ? 'flex' : 'none';
            this.modalTitle = $event.detail.modalTitle;
            this.iframeUrl = $event.detail.iframeUrl;
            this.iframeContent = $event.detail.iframeContent;
            this.modalStyle.display = 'flex';
            this.isOpen = true;

            setTimeout(() => this._focusEditorFirstInput(), 0);

            setTimeout(() => this._attachIframeEscapeKeyListener(), 500);
        },

        _focusEditorFirstInput() {
            if (!this.withEditor) return;

            const firstInput = this.$el.querySelector('.filament-peek-builder-editor input');

            firstInput && firstInput.focus();
        },

        _attachIframeEscapeKeyListener() {
            const iframe = this.$refs.previewModalBody.querySelector('iframe');

            if (!(iframe && iframe.contentWindow)) return;

            iframe.contentWindow.addEventListener('keyup', (e) => {
                if (e.key === 'Escape') this.handleEscapeKey();
            });
        },

        onRefreshPreviewModal($event) {
            this._restoreIframeScrollPosition();

            this.iframeUrl = $event.detail.iframeUrl;
            this.iframeContent = $event.detail.iframeContent;
        },

        _restoreIframeScrollPosition() {
            const iframe = this.$refs.previewModalBody.querySelector('iframe');

            if (iframe && iframe.contentWindow) {
                this._iframeScrollPosition = iframe.contentWindow.scrollY;

                setTimeout(() => {
                    iframe.contentWindow.scrollTo(0, this._iframeScrollPosition || 0);
                }, 50);
            }
        },

        onClosePreviewModal($event) {
            setTimeout(() => this._closeModal(), $event?.detail?.delay ? 250 : 0);
        },

        _closeModal() {
            document.body.classList.remove('is-filament-peek-preview-modal-open');

            this.withEditor = false;
            this.editorHasSidebarActions = false;
            this.editorIsResizing = false;
            this.editorStyle.display = 'none';
            this.editorTitle = null;
            this.modalStyle.display = 'none';
            this.modalTitle = null;
            this.iframeUrl = null;
            this.iframeContent = null;
            this.isOpen = false;
        },

        onEditorFocusOut($event) {
            if (!this.editorShouldAutoRefresh()) return;

            for (let handler of editorFocusOutHandlers) {
                if (typeof handler === 'function') {
                    handler($event, this);
                }
            }
        },

        editorShouldAutoRefresh() {
            if (!this.withEditor) return;
            if (!this.$refs.builderEditor) return;

            return !!this.$refs.builderEditor.dataset.shouldAutoRefresh;
        },

        handleEscapeKey() {
            if (!this.isOpen) return;
            if (!this.config.shouldCloseModalWithEscapeKey) return;
            if (this.withEditor) return;

            this.onClosePreviewModal();
        },

        acceptEditorChanges() {
            Livewire.emit('closeBuilderEditor');
        },

        discardEditorChanges() {
            this.$dispatch('close-preview-modal');
        },

        closePreviewModal() {
            this.$dispatch('close-preview-modal');
        },

        onEditorResizerMouseDown($event) {
            if (!this.$refs.builderEditor) return;

            this.editorIsResizing = true;

            resizerState.initialWidth = parseFloat(getComputedStyle(this.$refs.builderEditor).width);
            resizerState.initialX = $event.clientX;
        },

        onMouseUp($event) {
            if (!this.editorIsResizing) return;

            this.editorIsResizing = false;
        },

        onMouseMove($event) {
            if (!this.editorIsResizing) return;

            this.editorStyle.width = (resizerState.initialWidth + ($event.clientX - resizerState.initialX)) + 'px';
        },
    }));

    dispatch(document, 'peek:initialized');
});

document.addEventListener('peek:initializing', () => {
    // @todo: Select/Radio/Checkbox should be on 'change'
    // @todo: Toggle should be on 'click'

    Peek.onEditorFocusOut(($event, $modal) => {
        // built-in field tags
        const autorefreshTags = [
            'input',
            'select',
            'textarea',
            'trix-editor',
            'hex-color-picker',
        ];

        if (autorefreshTags.includes($event.target.tagName.toLowerCase())) {
            $modal.refreshBuilderPreview();
            return;
        }

        // built-in toggle field
        if (
            $event.target.tagName.toLowerCase() === 'button' &&
            $event.target.getAttribute('role') === 'switch'
        ) {
            $modal.refreshBuilderPreview();
            return;
        }

        // filament-tiptap-editor
        if ($event.target.classList.contains('ProseMirror')) {
            $modal.refreshBuilderPreview();
            return;
        }
    });
});

window.FilamentPeek = Peek;
