'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import UniversalDisposable from '../../commons-node/UniversalDisposable';
import {logger} from './logger';
import {DebuggerConnection} from './DebuggerConnection';
import invariant from 'assert';
import {connectToIwdp} from './connectToIwdp';

import type {ConnectableObservable} from 'rxjs';

const {log} = logger;

let lastServiceObjectDispose = null;

import {ClientCallback} from '../../nuclide-debugger-common/lib/main';

export class IwdpDebuggerService {
  _clientCallback: ClientCallback;
  _disposables: UniversalDisposable;
  _debuggerConnection: ?DebuggerConnection;

  constructor() {
    if (lastServiceObjectDispose != null) {
      lastServiceObjectDispose();
    }
    lastServiceObjectDispose = this.dispose.bind(this);
    this._disposables = new UniversalDisposable();
    this._clientCallback = new ClientCallback();
    this._disposables.add(this._clientCallback);
  }

  getServerMessageObservable(): ConnectableObservable<string> {
    return this._clientCallback.getServerMessageObservable().publish();
  }

  attach(): Promise<string> {
    return new Promise(resolve => {
      this._disposables.add(
        connectToIwdp().subscribe(deviceInfos => {
          log(`Got device infos: ${JSON.stringify(deviceInfos)}`);
          invariant(deviceInfos.length > 0, 'DeviceInfo array is empty.');
          this._debuggerConnection = new DebuggerConnection(
            deviceInfos[0],
            message => this._clientCallback.sendChromeMessage(message),
          );
          // Block resolution of this promise until we have successfully connected to the proxy.
          resolve('IWDP connected');
        }),
      );
    });
  }

  sendCommand(message: string): Promise<void> {
    if (this._debuggerConnection != null) {
      this._debuggerConnection.sendCommand(message);
    }
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    this._disposables.dispose();
    return Promise.resolve();
  }
}
