import * as vscode from 'vscode';
import { languages, TextDocument, DocumentLinkProvider, DocumentLink, Range, workspace, Position, Uri } from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	const linkProvider = languages.registerDocumentLinkProvider({language: 'json', scheme: 'file', pattern: '**/package.json'},
		new NodePkgLinkProvider()
	);
	context.subscriptions.push(linkProvider);
}

const HOMEPAGE_PREFIX = 'https://www.npmjs.com/package/';

class NodePkgLinkProvider implements DocumentLinkProvider{
	async provideDocumentLinks(document: TextDocument): Promise<DocumentLink[]> {
		 // get dependencies
		 const docText = document.getText();
		 const {dependencies = {}, devDependencies = {}} = JSON.parse(docText);
		 const dependencyList = Object.keys({...dependencies, ...devDependencies});
		// 获取对应依赖的 homepage
		 const homepages = await Promise.all(
			 dependencyList.map(pkg => this.getPkgHomepage(pkg, document.uri))
		 ).catch(err => {
			 console.log(err);
			 throw new Error(err.message);
		 });

		 return dependencyList.map((pkg, i) => {
			 const index = docText.search(pkg);
			 const position = document.positionAt(index);

			 return new DocumentLink(
				 new Range(
					 position,
					 new Position(position.line, position.character + pkg.length)
				 ),
				 Uri.parse(homepages[i])
			 );
		 });
	}

	async getPkgHomepage(pkg: string, uri: Uri): Promise<string> {
    const conf = workspace.getConfiguration('node-package-links');
    const customScopeMap = conf.get("scopeLinkMap") as any;
    const prefixKey = Object.keys(customScopeMap).find(scope => pkg.startsWith(scope));
    let defaultHomePage = HOMEPAGE_PREFIX + pkg;
    if(prefixKey) {
      defaultHomePage = customScopeMap[prefixKey] + pkg;
		}

		const nodeModuleDir = getNodeModuleDir(uri);
		const resources = await workspace.fs.readDirectory(nodeModuleDir);
		const {scope, name} = getScopePkg(pkg);
		if(scope) {
			const scopeDir = resources.find(resource => resource[0] === scope);
			if(scopeDir) {
				const homepage = await getHomepageFromPkg(Uri.file(path.resolve(nodeModuleDir.fsPath, scopeDir[0])), name);
				return homepage || defaultHomePage;
			} else {
				return defaultHomePage;
			}
		} else {
			const pkgDirName = resources.find(resource => resource[0] === pkg);
			if(pkgDirName) {
				const homepage = await getHomepageFromPkg(nodeModuleDir, pkgDirName[0]);
				return homepage || defaultHomePage;
			} else {
				return defaultHomePage;
			}
		}
  }
}

function getNodeModuleDir(uri: Uri):Uri {
	const absolutePath = path.resolve(uri.fsPath, '..', 'node_modules');
	return Uri.file(absolutePath);
}

function getScopePkg(pkg: string): {scope:string, name: string} {
	if(pkg.startsWith('@')) {
		const arr = pkg.split('/');
		return {scope: arr[0], name: arr[1]};
	} else {
		return {scope: '', name: pkg};
	}
}

async function getHomepageFromPkg(nodeModuleDir: Uri, pkgdir: string):Promise<string> {
	try {
		const pkgUri = Uri.file(path.resolve(nodeModuleDir.fsPath, pkgdir, 'package.json'));
		const content = await workspace.fs.readFile(pkgUri);
		const {homepage} = JSON.parse(content.toString());
		return homepage;
	} catch (error) {
		console.log('error is: ', error);
		return '';
	}
}

export function deactivate() {}
