import * as fs from "fs";
import * as MDAST from "mdast";
import * as path from "path";
import * as remark from "remark";
import { Node } from "unist";
import * as find from "unist-util-find";

import getNoteLinks, { NoteLinkEntry } from "./getNoteLinks";
import processor from "./processor";

const missingTitleSentinel = { type: "missingTitle" } as const;

const headingFinder = processor().use(() => tree =>
  find(tree, { type: "heading", depth: 1 }) || missingTitleSentinel
);
interface Note {
  title: string;
  links: NoteLinkEntry[];
  noteContents: string;
  parseTree: MDAST.Root;
}

function fileNameWithoutExtension(path: string): string {
  return path.split("/").slice(-1)[0].split(".")[0];
}

function withGollumPageNamingScheme(name: string): string {
  return name.replace(/-/g, " ");
}

function servesAsPageHeader(headingNode: Node): boolean {
  return headingNode.position?.start.line === 0;
}

async function readNote(notePath: string): Promise<Note> {
  const noteContents = await fs.promises.readFile(notePath, {
    encoding: "utf-8"
  });

  const parseTree = processor.parse(noteContents) as MDAST.Root;
  const headingNode = await headingFinder.run(parseTree);
  let title: string;
  if (headingNode.type === "missingTitle" || !servesAsPageHeader(headingNode)) {
    title = withGollumPageNamingScheme(fileNameWithoutExtension(notePath));
  } else {
    title = remark()
      .stringify({
        type: "root",
        children: (headingNode as MDAST.Heading).children
      })
      .trimEnd();
  }

  return { title, links: getNoteLinks(parseTree), parseTree, noteContents };
}

const HIDDEN_FILE_REG_EXP = /^[._]/;

export default async function readAllNotes(
  noteFolderPath: string
): Promise<{ [key: string]: Note }> {
  const noteDirectoryEntries = await fs.promises.readdir(noteFolderPath, {
    withFileTypes: true
  });
  const notePaths = noteDirectoryEntries
    .filter(entry => entry.isFile() && !entry.name.match(HIDDEN_FILE_REG_EXP) && entry.name.endsWith(".md"))
    .map(entry => path.join(noteFolderPath, entry.name));

  const noteEntries = await Promise.all(
    notePaths.map(async notePath => [notePath, await readNote(notePath)])
  );
  return Object.fromEntries(noteEntries);
}
