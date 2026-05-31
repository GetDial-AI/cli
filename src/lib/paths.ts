import { homedir } from "node:os";
import { join } from "node:path";

export type Paths = {
  configDir: string;
  dataDir: string;
  stateDir: string;
  configFile: string;
  authFile: string;
  pendingSignupFile: string;
  localTargetsFile: string;
  listenLog: string;
  listenOutLog: string;
  listenErrLog: string;
  listenPid: string;
  cliLog: string;
};

export function paths(): Paths {
  const home = process.env.HOME ?? homedir();
  const configHome = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  const dataHome = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  const stateHome = process.env.XDG_STATE_HOME ?? join(home, ".local", "state");

  const configDir = join(configHome, "dial");
  const dataDir = join(dataHome, "dial");
  const stateDir = join(stateHome, "dial");

  return {
    configDir,
    dataDir,
    stateDir,
    configFile: join(configDir, "config.json"),
    authFile: join(dataDir, "auth.json"),
    pendingSignupFile: join(dataDir, "pending-signup.json"),
    localTargetsFile: join(configDir, "local-targets.json"),
    listenLog: join(stateDir, "listen.log"),
    listenOutLog: join(stateDir, "listen.out.log"),
    listenErrLog: join(stateDir, "listen.err.log"),
    listenPid: join(stateDir, "listen.pid"),
    cliLog: join(stateDir, "cli.log"),
  };
}
