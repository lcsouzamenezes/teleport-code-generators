import {
  FileType,
  GeneratedFile,
  ProjectPlugin,
  ProjectPluginStructure,
} from '@teleporthq/teleport-types'
import prettierHTML from '@teleporthq/teleport-postprocessor-prettier-html'
import { load } from 'cheerio'

class ProjectPluginCloneGlobals implements ProjectPlugin {
  async runBefore(structure: ProjectPluginStructure) {
    return structure
  }

  async runAfter(structure: ProjectPluginStructure) {
    const { files, uidl } = structure
    const entryFile = files.get('entry')?.files[0]
    if (!entryFile) {
      return structure
    }

    const parsedEntry = (await import('cheerio').then((mod) => mod.load))(entryFile.content)
    /* Script tags that are attached to the body, example teleport-custom-scripts from studio */
    const scriptTagsFromRootHead = parsedEntry('head').find('script').toString()
    const scriptTagsFromRootBody = parsedEntry('body').find('script').toString()
    const metaTagsFromRoot = parsedEntry('head').find('meta').toString()
    const titleTagsFromRoot = parsedEntry('head').find('title').toString()

    parsedEntry('head').find('script').remove()
    parsedEntry('body').find('script').remove()
    parsedEntry('head').find('meta').remove()
    parsedEntry('head').find('title').remove()

    if (Object.values(uidl.root?.styleSetDefinitions || {}).length > 0) {
      parsedEntry('head').append(`<link rel="stylesheet" href="./style.css"></link>`)
    }

    parsedEntry('head').append(scriptTagsFromRootHead.toString())

    const memoryFiles = Object.fromEntries(files)
    for (const id in memoryFiles) {
      if (memoryFiles.hasOwnProperty(id)) {
        const fileId = memoryFiles[id]
        if (fileId.path.length === 1 && fileId.path[0] === '') {
          const newFiles: GeneratedFile[] = fileId.files.map((file) => {
            if (file.fileType === FileType.HTML) {
              parsedEntry('body').empty()
              parsedEntry('head').find('title').remove()
              parsedEntry('head').find('meta').remove()

              const parsedIndividualFile = load(file.content)

              const metaTags = parsedIndividualFile.root().find('meta')
              parsedEntry('head').prepend(metaTags.toString().concat(metaTagsFromRoot))
              metaTags.remove()

              const titleTags = parsedIndividualFile.root().find('title')
              parsedEntry('head').prepend(
                titleTags.length ? titleTags.toString() : titleTagsFromRoot
              )
              titleTags.remove()

              parsedEntry('body').append(parsedIndividualFile.html())
              parsedEntry('body').append(scriptTagsFromRootBody.toString())

              const prettyFile = prettierHTML({
                [FileType.HTML]: parsedEntry.html(),
              })

              return {
                name: file.name,
                content: prettyFile[FileType.HTML],
                fileType: FileType.HTML,
              }
            }
            return file
          })
          files.set(id, { path: fileId.path, files: newFiles })
        }
      }
    }

    files.delete('entry')
    return structure
  }
}

export const pluginCloneGlobals = Object.freeze(new ProjectPluginCloneGlobals())
