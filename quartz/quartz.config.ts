import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "LUX UNIVERSE",
    pageTitleSuffix: " — LUX",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "en-US",
    baseUrl: "lux.glitch.ro",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Space Grotesk",
        body: "Inter",
        code: "JetBrains Mono",
      },
      colors: {
        lightMode: {
          light: "#fffef9",
          lightgray: "#e8e6df",
          gray: "#9a9890",
          darkgray: "#3d3b35",
          dark: "#1a1915",
          secondary: "#8b4513",
          tertiary: "#d4a574",
          highlight: "rgba(212, 165, 116, 0.15)",
          textHighlight: "#d4a57444",
        },
        darkMode: {
          light: "#0d0c0a",
          lightgray: "#1f1e1a",
          gray: "#4a473f",
          darkgray: "#c9c5b8",
          dark: "#f5f3eb",
          secondary: "#d4a574",
          tertiary: "#8b6914",
          highlight: "rgba(212, 165, 116, 0.15)",
          textHighlight: "#d4a57444",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // CustomOgImages disabled - requires network access for fonts
      // Plugin.CustomOgImages(),
    ],
  },
}

export default config
