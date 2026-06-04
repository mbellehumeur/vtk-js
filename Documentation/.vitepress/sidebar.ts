import { DefaultTheme } from 'vitepress'

export const sidebar: DefaultTheme.Sidebar = {
  "/docs/": [
    {
      "text": "Getting Started",
      "collapsed": true,
      "items": [
        {
          "text": "Overview",
          "link": "/docs/index.html"
        },
        {
          "text": "Import from a CDN",
          "link": "/docs/intro_vtk_as_external_script.html"
        },
        {
          "text": "ES6 Dependency",
          "link": "/docs/intro_vtk_as_es6_dependency.html"
        },
        {
          "text": "React Usage",
          "link": "/docs/vtk_react.html"
        },
        {
          "text": "Vue Usage",
          "link": "/docs/vtk_vue.html"
        },
        {
          "text": "Vanilla Usage",
          "link": "/docs/vtk_vanilla.html"
        },
        {
          "text": "Tutorial",
          "link": "/docs/tutorial.html"
        },
        {
          "text": "Old ES6 Docs",
          "link": "/docs/old_intro_vtk_es6.html"
        }
      ]
    },
    {
      "text": "Develop",
      "collapsed": true,
      "items": [
        {
          "text": "Requirement",
          "link": "/docs/develop_requirement.html"
        },
        {
          "text": "Class",
          "link": "/docs/develop_class.html"
        },
        {
          "text": "Example",
          "link": "/docs/develop_example.html"
        },
        {
          "text": "Test",
          "link": "/docs/develop_test.html"
        },
        {
          "text": "Build",
          "link": "/docs/develop_build.html"
        },
        {
          "text": "Widget",
          "link": "/docs/develop_widget.html"
        },
        {
          "text": "WebGPU",
          "link": "/docs/develop_webgpu.html"
        },
        {
          "text": "WebXR",
          "link": "/docs/develop_webxr.html"
        }
      ]
    },
    {
      "text": "Concepts",
      "collapsed": true,
      "items": [
        {
          "text": "Widgets",
          "link": "/docs/concepts_widgets.html"
        }
      ]
    },
    {
      "text": "Miscellaneous",
      "collapsed": true,
      "items": [
        {
          "text": "Tools",
          "link": "/docs/misc_tools.html"
        },
        {
          "text": "Troubleshooting",
          "link": "/docs/misc_troubleshooting.html"
        },
        {
          "text": "Contributing",
          "link": "/docs/misc_contributing.html"
        }
      ]
    },
    {
      "text": "Data Format",
      "collapsed": true,
      "items": [
        {
          "text": "Structures",
          "link": "/docs/structures.html"
        },
        {
          "text": "Data Array",
          "link": "/docs/structures_DataArray.html"
        },
        {
          "text": "String Array",
          "link": "/docs/structures_StringArray.html"
        },
        {
          "text": "Poly Data",
          "link": "/docs/structures_PolyData.html"
        }
      ]
    },
    {
      "text": "Testing",
      "collapsed": true,
      "items": [
        {
          "text": "Tests",
          "link": "/vtk-js/coverage/tests.html"
        },
        {
          "text": "Coverage",
          "link": "/vtk-js/coverage/home.html"
        }
      ]
    }
  ],
  "/api/": []
}