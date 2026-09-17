(function () {
    'use strict';
    window.SMHistory = window.SMHistory || {};
    const BaseCommand = window.SMHistory.BaseCommand || window.BaseCommand;

    class CompoundCommand extends BaseCommand {
        constructor(name = 'Batch Action') {
            super(name, 'compound');
            this.commands = [];
        }

        add(command) {
            if (!command) return;
            this.commands.push(command);
            this.byteSize += (command.byteSize || 0);
        }

        undo() {
            for (let i = this.commands.length - 1; i >= 0; i--) {
                this.commands[i].undo();
            }
        }

        execute() {
            for (let i = 0; i < this.commands.length; i++) {
                this.commands[i].execute();
            }
        }

        redo() {
            for (let i = 0; i < this.commands.length; i++) {
                this.commands[i].redo();
            }
        }

        dispose() {
            for (let i = 0; i < this.commands.length; i++) {
                this.commands[i].dispose?.();
            }
            this.commands = [];
            this.byteSize = 0;
        }
    }

    class TransactionManager {
        constructor(historyManager) {
            this.historyManager = historyManager;
            this.activeTransaction = null;
            this.depth = 0;
        }

        get isActive() {
            return this.depth > 0 && this.activeTransaction !== null;
        }

        begin(name = 'Batch Operation') {
            this.depth++;
            if (this.depth === 1) {
                this.activeTransaction = new CompoundCommand(name);
            }
        }

        commit() {
            if (this.depth <= 0) return;
            this.depth--;

            if (this.depth === 0 && this.activeTransaction) {
                const compound = this.activeTransaction;
                this.activeTransaction = null;
                if (compound.commands.length > 0) {
                    this.historyManager.recordCommand(compound);
                }
            }
        }

        rollback() {
            if (this.activeTransaction) {
                this.activeTransaction.undo();
                this.activeTransaction.dispose();
                this.activeTransaction = null;
            }
            this.depth = 0;
        }

        record(command) {
            if (this.isActive) {
                this.activeTransaction.add(command);
                return true;
            }
            return false;
        }
    }

    window.SMHistory.CompoundCommand = CompoundCommand;
    window.SMHistory.TransactionManager = TransactionManager;
})();