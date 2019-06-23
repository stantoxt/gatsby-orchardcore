const Debug = require('debug')
const { createFilePath } = require('gatsby-source-filesystem')
const path = require('path')
const fs = require('fs')
const mkdirp = require('mkdirp')
const buildFlowTemplate = require('gatsby-theme-orchardcore-flows/src/buildFlowTemplate')
  .default
const FlowPartFragment = require('gatsby-theme-orchardcore-flows/src/FlowPartFragment')
  .default

// make sure src/pages exists for the filesystem source or it will error
exports.onPreBootstrap = ({ store }) => {
  const debug = Debug('gatsby-theme-orchardcore-pages:onPreBoostrap')

  const { program } = store.getState()
  const dir = `${program.directory}/src/pages`
  debug(`ensuring ${dir} exists`)

  if (!fs.existsSync(dir)) {
    debug(`creating ${dir}`)
    mkdirp.sync(dir)
  }
}

/**
 * When shipping NPM modules, they typically need to be either
 * pre-compiled or the user needs to add bundler config to process the
 * files. Gatsby lets us ship the bundler config *with* the theme, so
 * we never need a lib-side build step.  Since we dont pre-compile the
 * theme, this is how we let webpack know how to process files.
 */
exports.onCreateWebpackConfig = ({ stage, loaders, plugins, actions }) => {
  const debug = Debug('gatsby-theme-orchardcore-pages:onCreateWebpackConfig')
  debug('ensuring Webpack will compile theme code')
  actions.setWebpackConfig({
    module: {
      rules: [
        {
          test: /\.js$/,
          include: path.dirname(
            require.resolve('gatsby-theme-orchardcore-pages')
          ),
          use: [loaders.js()],
        },
      ],
    },
  })
}

exports.createPages = ({ store, graphql, actions, getNodesByType }) => {
  const debug = Debug('gatsby-theme-orchardcore-pages:createPages')

  const { createPage } = actions
  const baseTemplate = require.resolve('./src/templates/Page.tsx')

  const widgets = getNodesByType(`Widget`)
  const flowPartFragment = new FlowPartFragment(widgets)
  const fragment = flowPartFragment.toString()

  const pageQuery = `
        ${widgets.map(widget => widget.fragment)}
        ${fragment}
        {
            cms {
                page(status: PUBLISHED) {
                    contentItemId
                    contentType
                    autoroutePart {
                        path
                    }
                    displayText
                    flowPart {
                        ...FlowPartWidgets
                    }
                }
            }
        }
    `

  console.log(`Page Query: ${pageQuery}`)

  return new Promise((resolve, reject) => {
    resolve(
      graphql(pageQuery).then(result => {
        if (result.errors) {
          console.log(result.errors)
          reject(result.errors)
        }

        if (!result.data || !result.data.cms) {
          console.log('Could not query the CMS for pages!')
          reject()
          return
        }

        // Create blog posts pages.
        const pages = result.data.cms.page

        // tslint:disable-next-line: no-console
        console.log('Building CMS pages.')

        pages.forEach((page, index) => {
          if (!page) {
            return
          }

          const pagePath = page.autoroutePart.path
          const pageName = pagePath.replace(/[^a-z0-9]+/gi, '')

          console.log(`Creating page ${pageName} for ${pagePath}`)

          // Build a unique page template based on the widgets in the current page.
          const pageTemplate = buildFlowTemplate(
            pageName,
            baseTemplate,
            page,
            store,
            getNodesByType
          )

          debug('creating', pagePath)
          createPage({
            component: pageTemplate,
            context: {
              contentItemId: page.contentItemId,
              slug: pagePath,
            },
            path: pagePath,
          })
        })
      })
    )
  })
}