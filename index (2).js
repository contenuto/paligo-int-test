#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { exit } = require('process')
const Stream = require('stream')
const { readlines } = require('./readlines-ng')

let dir = process.argv[2] || path.join(__dirname, '..', '..', '..', '..')
if (!dir) exit(1)
const outdir = path.join(__dirname, '..', 'snippets.json')
console.log('Reading snippets from', path.resolve(dir))

let stream = fs.createWriteStream(outdir)

let ignoreDirectories = [
    'node_modules',
    '.gradle', 
    'temp',
    '.idea', 
    '.vscode',
    'target',
    'dist',
    '.DS_Store',
    'perf.data',
    'tags',
    '.env'
]

const testFileExtsToLanguage = {
    'rs': 'rust',
    'm': 'objc',
    'swift': 'swift',
    'test.cpp': 'cpp',
    'test.sh': 'http',
    'spec.ts': 'javascript',
    'cs': 'csharp',
    'kt': 'kotlin',
    'java': 'java'
}

let snippets = Object.values(testFileExtsToLanguage).reduce((acc, lang) => {
    acc[lang] = {}
    return acc
}, {})

generateSnippetsInDirRecursively(dir).then(() => {
    console.log('Writing snippets to', outdir)
    stream.write(JSON.stringify(snippets, null, 2))
})

let Commands = {
    START: '\/\/\\s?@ditto\/snippet-start\\s?(\\S+)\.*',
    END: '\/\/\\s?@ditto\/snippet-end\.*',
    IGNORE: '\/\/\\s?@ditto\/snippet-ignore-next-line\.*',
    INCLUDE: '\/\/\\s?@ditto\/snippet-include-next-line\.*'
}

function shouldParse (ext) {
    return testFileExtsToLanguage[ext]
}

async function generateSnippet(filename) {
    let ext = filename.split('.').slice(1).join('.')
    let language = shouldParse(ext)
    if (!language) return

    let snippet = {
        first: true,
        name: null,
        numLeadingWhitespaceCharacters: 0,
        data: ''
    }

    let prev = null

    for await (let line of readlines(filename, { encoding: 'utf8' })) {
        if (!snippet.name) {
            // No current snippet
            let start = new RegExp(Commands.START).exec(line)
            if (start) {
                snippet.name = start[1]
                // If there is an existing snippet, append to the end of it
                let existing = snippets[language][snippet.name]
                if (existing && snippet.data.length > 0) {
                    snippet.data = existing
                }
            }
            continue
        }

        // In the middle of a snippet
        let end = new RegExp(Commands.END).exec(line)
        if (end) {
            snippets[language][snippet.name] = snippet.data + '\n\n'
            snippet.name = null
            snippet.data = ''
            snippet.first = true
            prev = line
            continue
        }

        // ignoring
        if (prev === Commands.IGNORE) {
            prev = null
            continue
        } else {
            let ignoreNext = new RegExp(Commands.IGNORE).exec(line)
            if (ignoreNext) {
                prev = Commands.IGNORE
                continue
            }
        }

        // including
        if (prev === Commands.INCLUDE) {
            prev = null
            line = line.replace('//', '') // remove comment at beginning of line
        } else {
            let includeNext = new RegExp(Commands.INCLUDE).exec(line)
            if (includeNext) {
                prev = Commands.INCLUDE
                continue
            }
        }

        // else, add the line like normal
        if (snippet.first) {
            let after = line.trim()
            if (after.length !== 0) {
                snippet.numLeadingWhitespaceCharacters = line.length - after.length
                snippet.first = false
            }
        } else {
            snippet.data += '\n'
        }
        snippet.data += line.slice(snippet.numLeadingWhitespaceCharacters)
    }

}

async function generateSnippetsInDirRecursively(dir) {
    if (ignoreDirectories.indexOf(dir) > -1) return
    let files = fs.readdirSync(dir, { withFileTypes: true })
    for (let file of files) {
        if (file.isDirectory()) await generateSnippetsInDirRecursively(path.resolve(dir, file.name))
        else {
            let filename = path.join(dir, file.name)
            await generateSnippet(filename)
        }
    }
}
