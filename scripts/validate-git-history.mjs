import { execSync } from 'node:child_process';

const genericMessagePattern = /^(fix|修改|更新代码|xu-wuliu|update code|update|wip)$/i;
const preferredMessagePatterns = [/^【[^】]+】.+$/, /^(feat|fix|docs|test|refactor|chore)\([^)]+\): .+$/];
const largeCommitThreshold = 30;

function run(command) {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function listCommits() {
  const raw = run('git log --date=iso --pretty=format:"%H%x09%ad%x09%s"');
  if (!raw) {
    return [];
  }

  return raw.split(/\r?\n/).map((line) => {
    const [sha, date, ...subjectParts] = line.split('\t');
    return {
      sha,
      date,
      day: date.slice(0, 10),
      subject: subjectParts.join('\t').trim(),
    };
  });
}

function getChangedFileCount(sha) {
  const output = run(`git diff-tree --no-commit-id --name-only -r ${sha}`);
  if (!output) {
    return 0;
  }
  return output.split(/\r?\n/).filter(Boolean).length;
}

function main() {
  const commits = listCommits();
  const byDay = new Map();
  const violations = [];

  for (const commit of commits) {
    byDay.set(commit.day, (byDay.get(commit.day) ?? 0) + 1);
    const changedFiles = getChangedFileCount(commit.sha);

    if (genericMessagePattern.test(commit.subject)) {
      violations.push({
        type: 'generic-message',
        sha: commit.sha,
        day: commit.day,
        subject: commit.subject,
        changedFiles,
      });
    }

    if (!preferredMessagePatterns.some((pattern) => pattern.test(commit.subject))) {
      violations.push({
        type: 'nonstandard-message',
        sha: commit.sha,
        day: commit.day,
        subject: commit.subject,
        changedFiles,
      });
    }

    if (changedFiles >= largeCommitThreshold) {
      violations.push({
        type: 'large-commit',
        sha: commit.sha,
        day: commit.day,
        subject: commit.subject,
        changedFiles,
      });
    }
  }

  const summary = {
    totalCommits: commits.length,
    activeDays: Array.from(byDay.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, count]) => ({ day, count })),
    violations,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}

main();
