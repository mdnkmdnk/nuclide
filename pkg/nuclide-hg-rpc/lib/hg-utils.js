'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Observable} from 'rxjs';
import type {ProcessMessage} from '../../commons-node/process-rpc-types';
import type {HgExecOptions} from './hg-exec-types';

import {asyncExecute, createArgsForScriptCommand} from '../../commons-node/process';
import {getLogger} from '../../nuclide-logging';
import fsPromise from '../../commons-node/fsPromise';
import {
  getOriginalEnvironment,
  observeProcess,
  safeSpawn,
  runCommand,
} from '../../commons-node/process';


// Mercurial (as of v3.7.2) [strips lines][1] matching the following prefix when a commit message is
// created by an editor invoked by Mercurial. Because Nuclide is not invoked by Mercurial, Nuclide
// must mimic the same stripping.
//
// Note: `(?m)` converts to `/m` in JavaScript-flavored RegExp to mean 'multiline'.
//
// [1] https://selenic.com/hg/file/3.7.2/mercurial/cmdutil.py#l2734
const COMMIT_MESSAGE_STRIP_LINE = /^HG:.*(\n|$)/gm;

/**
 * Calls out to checkOutput using the 'hg' command.
 * @param options as specified by http://nodejs.org/api/child_process.html. Additional options:
 *   - NO_HGPLAIN set if the $HGPLAIN environment variable should not be used.
 *   - TTY_OUTPUT set if the command should be run as if it were attached to a tty.
 */
export async function hgAsyncExecute(args_: Array<string>, options_: HgExecOptions): Promise<any> {
  const {command, args, options} = getHgExecParams(args_, options_);
  const result = await asyncExecute(command, args, options);
  if (result.exitCode === 0) {
    return result;
  } else {
    logAndThrowHgError(args, options, result.stdout, result.stderr);
  }
}

/**
 * Calls hg commands, returning an Observable to allow aborting and streaming progress output.
 */
export function hgObserveExecution(
  args_: Array<string>,
  options_: HgExecOptions,
): Observable<ProcessMessage> {
  const {command, args, options} = getHgExecParams(args_, options_);
  return observeProcess(
    () => safeSpawn(command, args, options),
  );
}

/**
 * Calls hg commands, returning an Observable to allow aborting.
 * Resolves to stdout.
 */
export function hgRunCommand(
  args_: Array<string>,
  options_: HgExecOptions,
): Observable<string> {
  const {command, args, options} = getHgExecParams(args_, options_);
  return runCommand(command, args, options);
}

function logAndThrowHgError(
  args: Array<string>,
  options: Object,
  stdout: string,
  stderr: string,
): void {
  getLogger().error(`Error executing hg command: ${JSON.stringify(args)}\n`
    + `stderr: ${stderr}\nstdout: ${stdout}\n`
    + `options: ${JSON.stringify(options)}`);
  if (stderr.length > 0 && stdout.length > 0) {
    throw new Error(`hg error\nstderr: ${stderr}\nstdout: ${stdout}`);
  } else {
    // One of `stderr` or `stdout` is empty - not both.
    throw new Error(stderr || stdout);
  }
}

function getHgExecParams(
  args_: Array<string>,
  options_: HgExecOptions,
): {command: string, args: Array<string>, options: Object} {
  let args = args_;
  const options = {
    ...options_,
    env: {...getOriginalEnvironment()},
  };
  if (!options.NO_HGPLAIN) {
    // Setting HGPLAIN=1 overrides any custom aliases a user has defined.
    options.env.HGPLAIN = 1;
  }
  if (options.HGEDITOR != null) {
    options.env.HGEDITOR = options.HGEDITOR;
  }

  let command;
  if (options.TTY_OUTPUT) {
    command = 'script';
    args = createArgsForScriptCommand('hg', args);
  } else {
    command = 'hg';
  }
  return {command, args, options};
}

export async function createCommmitMessageTempFile(commitMessage: string): Promise<string> {
  const tempFile = await fsPromise.tempfile();
  const strippedMessage = commitMessage.replace(COMMIT_MESSAGE_STRIP_LINE, '');
  await fsPromise.writeFile(tempFile, strippedMessage);
  return tempFile;
}
