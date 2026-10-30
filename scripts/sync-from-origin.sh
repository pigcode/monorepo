#!/usr/bin/env bash
# 把 pigcode-origin 的内容同步进 pigcode 的分仓（frontend、docs），内容逐字节一致。
#
# pigcode 保持 frontend/ 与 docs/ 两个独立仓库及各自的 GitHub remote，
# pigcode-origin 是单一 monorepo。本脚本只搬运 git 跟踪的文件：
# node_modules、out、.omc 等被忽略的产物留在原地，不参与同步也不被删除。
#
#   ./scripts/sync-from-origin.sh              # 同步并提交
#   ./scripts/sync-from-origin.sh --dry-run    # 只报告差异，不写任何文件
#   ./scripts/sync-from-origin.sh --no-commit  # 同步并 stage，但不提交
#   ./scripts/sync-from-origin.sh --pull       # 同步前先在 origin 拉取最新代码
set -euo pipefail

ORIGIN_ROOT="${PIGCODE_ORIGIN:-/Users/liuqin/Documents/workspace/rust/pigcode-origin}"
TARGET_ROOT="${PIGCODE_TARGET:-/Users/liuqin/Documents/workspace/rust/pigcode}"

# origin 里的目录 -> pigcode 里的分仓。
SUBTREES=(frontend docs)

dry_run=0
do_commit=1
do_pull=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --no-commit) do_commit=0 ;;
    --pull) do_pull=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }

[ -d "$ORIGIN_ROOT/.git" ] || die "origin is not a git repo: $ORIGIN_ROOT"
[ -d "$TARGET_ROOT" ] || die "target missing: $TARGET_ROOT"

if [ "$do_pull" = 1 ]; then
  echo "==> pulling origin ($(git -C "$ORIGIN_ROOT" rev-parse --abbrev-ref HEAD))"
  git -C "$ORIGIN_ROOT" pull --ff-only
fi

origin_rev="$(git -C "$ORIGIN_ROOT" rev-parse --short HEAD)"
origin_subject="$(git -C "$ORIGIN_ROOT" log -1 --format=%s)"

# 工作区里有未提交改动时，同步会把这些改动一起卷进提交，所以先拒绝。
for subtree in "${SUBTREES[@]}"; do
  target="$TARGET_ROOT/$subtree"
  [ -d "$target/.git" ] || die "missing sub-repo: $target"
  if [ -n "$(git -C "$target" status --porcelain)" ]; then
    die "$target has uncommitted changes; commit or stash them first"
  fi
done

# 只删除目标仓库跟踪的文件；忽略产物（node_modules、out 等）原地保留。
clear_tracked() {
  local target="$1"
  local list
  list="$(mktemp)"
  git -C "$target" ls-files -z > "$list"
  ( cd "$target" && xargs -0 -r rm -f < "$list" )
  rm -f "$list"
  # 清理因文件移走而变空的目录，跳过 .git。
  find "$target" -mindepth 1 -path "$target/.git" -prune -o -type d -empty -print -delete > /dev/null
}

# 用 origin 子树的 tar 覆盖目标仓库，再以 tree 哈希做逐字节校验。
sync_subtree() {
  local subtree="$1"
  local target="$TARGET_ROOT/$subtree"
  local tmpd before expected tree changed

  tmpd="$(mktemp -d)"
  # 出错也必须清理临时目录。
  if ! git -C "$ORIGIN_ROOT" archive --format=tar "HEAD:$subtree" > "$tmpd/tree.tar"; then
    rm -rf "$tmpd"
    die "archive failed for $subtree"
  fi

  if [ "$dry_run" = 1 ]; then
    mkdir -p "$tmpd/origin" "$tmpd/target"
    tar -xf "$tmpd/tree.tar" -C "$tmpd/origin"
    # 目标仓库的跟踪文件导出成同样形状，再整体比对。
    local list="$tmpd/files"
    git -C "$target" ls-files -z > "$list"
    ( cd "$target" && xargs -0 -r tar -cf "$tmpd/tracked.tar" < "$list" )
    tar -xf "$tmpd/tracked.tar" -C "$tmpd/target"
    echo "--- $subtree: origin tracks $(git -C "$ORIGIN_ROOT" ls-tree -r --name-only "HEAD:$subtree" | wc -l | tr -d ' ') files ---"
    # 在临时目录里比对，diff 的输出才是相对路径。
    ( cd "$tmpd" && diff -rq origin target 2>&1 | sed -e 's|^Files origin/|  M |' -e 's| and target/.* differ$||' -e 's|^Only in origin/\(.*\): |  + \1/|' -e 's|^Only in target/\(.*\): |  - \1/|' ) || true
    rm -rf "$tmpd"
    return 0
  fi

  before="$(git -C "$target" rev-parse --short HEAD)"
  echo "==> $subtree <- origin:$subtree ($origin_rev)"

  clear_tracked "$target"
  tar -xf "$tmpd/tree.tar" -C "$target"
  rm -rf "$tmpd"

  # 校验：stage 后的 tree 必须与 origin 该子树的 tree 完全相同（含文件模式）。
  git -C "$target" add -A
  expected="$(git -C "$ORIGIN_ROOT" rev-parse "HEAD:$subtree")"
  tree="$(git -C "$target" write-tree)"
  if [ "$tree" != "$expected" ]; then
    echo "--- tree mismatch in $subtree ---" >&2
    echo "expected $expected (origin)" >&2
    echo "actual   $tree (target)" >&2
    die "content verification failed for $subtree"
  fi

  changed="$(git -C "$target" diff --cached --name-only | wc -l | tr -d ' ')"
  if [ "$changed" = 0 ]; then
    echo "    already in sync (tree $tree)"
  elif [ "$do_commit" = 1 ]; then
    # 提交信息带上 origin 的提交，便于回溯这次同步对应云端哪一版。
    git -C "$target" commit -q -m "sync: mirror pigcode-origin $origin_rev

$origin_subject"
    echo "    committed $(git -C "$target" rev-parse --short HEAD) ($changed paths, was $before)"
  else
    echo "    $changed paths staged in worktree (not committed)"
  fi
}

for subtree in "${SUBTREES[@]}"; do
  sync_subtree "$subtree"
done

if [ "$dry_run" = 1 ]; then
  echo "==> dry run, nothing written"
else
  echo "==> done; origin $origin_rev"
fi
