import * as vscode from 'vscode';

const translateTimeEditor = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No editor is active');
        return;
    }
    //al momento de escribir se traduce el texto automaticamente sin seleccionar el texto o precionar un boton
    vscode.workspace.onDidChangeTextDocument((event) => {
        const document = event.document;
        const selection = editor.selection;
        const text = document.getText(selection);
        if (text) {
            vscode.window.showInformationMessage('translateText function not implemented');
        }
    });

}