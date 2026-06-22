#!/system/bin/sh

# $id Installer/Upgrader
# Copyright 2019-2024, VR25
# License: GPLv3+
#
# devs: triple hashtags (###) mark non-generic code
#
# APatch/FolkPatch compatibility patch by Kerem
# - Detects KSU, APatch/FolkPatch, and Magisk environments
# - Uses correct busybox paths for each framework
# - Fixes module directory logic for APatch/FolkPatch (/data/adb/modules)
# - Adds APATCH env var checks alongside KSU checks

# override the official Magisk module installer
SKIPUNZIP=1
SKIPMOUNT=false

# ui_print fallback: Magisk sources util_functions.sh which defines ui_print.
# KSU/APatch/FolkPatch do not — define it here so the installer doesn't hang.
type ui_print > /dev/null 2>&1 || ui_print() { echo "$@"; }

echo

id=acc
domain=vr25
data_dir=/data/adb/$domain/${id}-data

# log
mkdir -p $data_dir/logs
# APatch/FolkPatch: stderr to stdout so errors appear in installer log
# Magisk: stderr to install.log
if ${APATCH:-false}; then
  exec 2>&1
else
  exec 2>$data_dir/logs/install.log
fi

exxit() {
  local e=$?
  set +eu
  rm -rf /dev/.$domain.${id}-install
  # For Magisk only (not KSU/APatch/FolkPatch)
  if ! ${KSU:-false} && ! ${APATCH:-false}; then
    rm -rf /data/adb/modules_update/$id
    (abort) > /dev/null
  fi
  echo
  exit $e
} 2>/dev/null

trap exxit EXIT

# set up busybox
#BB#
bin_dir=/data/adb/vr25/bin
busybox_dir=/dev/.vr25/busybox

# Determine the correct busybox location based on root framework
# Priority: user-placed > KSU busybox > APatch busybox > FolkPatch busybox > Magisk busybox > system busybox
if [ "${KSU:-false}" = "true" ]; then
  # KernelSU busybox location
  ksu_busybox="$(ls /data/adb/ksu/bin/busybox 2>/dev/null || :)"
else
  ksu_busybox=""
fi

if [ "${APATCH:-false}" = "true" ]; then
  # APatch and FolkPatch both use /data/adb/ap/bin/busybox
  apatch_busybox="$(ls /data/adb/ap/bin/busybox 2>/dev/null || :)"
else
  apatch_busybox=""
fi

magisk_busybox="$(ls /data/adb/*/bin/busybox /data/adb/magisk/busybox 2>/dev/null | head -1 || :)"

[ -x $busybox_dir/ls ] || {
  mkdir -p $busybox_dir
  chmod 0755 $busybox_dir $bin_dir/busybox 2>/dev/null || :
  for f in \
    $bin_dir/busybox \
    $ksu_busybox \
    $apatch_busybox \
    $magisk_busybox \
    /system/*bin/busybox*
  do
    [ -x "$f" ] && eval $f --install -s $busybox_dir/ && break || :
  done
  [ -x $busybox_dir/ls ] || {
    echo "Install busybox or simply place it in $bin_dir/"
    echo
    exit 3
  }
}

case $PATH in
  $bin_dir:*) ;;
  *) export PATH="$bin_dir:$busybox_dir:$PATH";;
esac

unset f bin_dir busybox_dir magisk_busybox ksu_busybox apatch_busybox
#/BB#

# root check
[ $(id -u) -ne 0 ] && {
  echo "$0 must run as root (su)"
  exit 4
}

get_prop() { sed -n "s|^$1=||p" ${2:-$srcDir/module.prop}; }

set_perms() {
  local owner=${2:-0}
  local perms=0644
  local target=
  target=$(readlink -f $1)
  if echo $target | grep -q '.*\.sh$' || [ -d $target ]; then perms=0755; fi
  chmod $perms $target
  chown $owner:$owner $target
  chcon u:object_r:system_file:s0 $target 2>/dev/null || :
}

set_perms_recursive() {
  local owner=${2-0}
  local target=
  find $1 2>/dev/null | while read target; do set_perms $target $owner; done
}

set -eu

# set source code directory
srcDir="$(cd "${0%/*}" 2>/dev/null || :; echo "$PWD")"

# extract flashable zip if source code is unavailable
[ -d $srcDir/install ] || {
  srcDir=/dev/.$domain.${id}-install
  rm -rf $srcDir 2>/dev/null || :
  mkdir $srcDir
  # Determine zip path — check each variable independently, never use MODPATH as zip path
  _zip="${APK:-}"
  [ -n "$_zip" ] || _zip="${ZIPFILE:-}"
  [ -n "$_zip" ] || _zip="${3:-}"
  # FolkPatch/APatch fallback: zip is at a known cache path
  [ -n "$_zip" ] || _zip="$(ls /data/user/*/me.yuki.folk/cache/module_APM.zip 2>/dev/null | head -1)"
  [ -n "$_zip" ] || { echo "Cannot find module zip"; exit 1; }
  unzip "$_zip" -d $srcDir/ >&2 || { echo "unzip failed: $_zip"; exit 1; }
  unset _zip
}

name=$(get_prop name)
author=$(get_prop author)
version=$(get_prop version)
magiskModDir=/data/adb/modules
versionCode=$(get_prop versionCode)
accaFiles=/data/data/mattecarra.accapp/files ###

: ${installDir:=$accaFiles} ###

config=$data_dir/config.txt

# Detect root framework
# KSU sets $KSU=true, APatch/FolkPatch sets $APATCH=true
# If neither is set yet, try to auto-detect
export KSU=${KSU:-false}
export APATCH=${APATCH:-false}

# Auto-detect if not set by the framework
if ! $KSU && ! $APATCH; then
  # Check KernelSU
  [ -f /data/adb/ksu/bin/ksud ] && KSU=true
  # Check APatch / FolkPatch (both use /data/adb/ap/)
  [ -f /data/adb/ap/bin/apd ] && APATCH=true
  # Fallback: check Magisk modules directory used by KSU/APatch
  [ -d /data/adb/modules ] && {
    [ -f /data/adb/ksu/.installed ] && KSU=true || :
  }
fi

# Convenience: treat APatch and FolkPatch as "non-Magisk KSU-style" for install path purposes
# Both KSU and APatch/FolkPatch use /data/adb/modules
IS_MAGISK=false
IS_KSU_LIKE=false

if $KSU || $APATCH; then
  IS_KSU_LIKE=true
elif [ -d /data/adb/magisk ] || [ -f /data/adb/magisk/magisk ]; then
  IS_MAGISK=true
fi

# install in front-end's internal path by default
if [ "$installDir" != "$accaFiles" ]; then
  case "$installDir" in
    /data/data/*|/data/user/*)
      accaFiles="$installDir"
      ;;
  esac
fi

[ -d $magiskModDir ] && magisk=true || magisk=false

ls -d ${accaFiles%/*}* > /dev/null 2>&1 && acca=true || acca=false ###

# ensure AccA's files/ exists - to prevent unwanted downgrades ###
if $acca && [ ! -d $accaFiles ]; then
  if mkdir $accaFiles 2>/dev/null; then
    chown $(stat -c %u:%g ${accaFiles%/*}) $accaFiles
    chmod $(stat -c %a ${accaFiles%/*}) $accaFiles
    /system/bin/restorecon $accaFiles
  fi
fi

# check/change parent installation directory
# KSU, APatch, and FolkPatch all use /data/adb/modules
if $KSU || $APATCH; then
  installDir=$magiskModDir
elif $magisk; then
  installDir=$magiskModDir
fi

[ $installDir != /data/adb/$domain ] || mkdir -p $installDir

[ -d $installDir ] || {
  installDir=/data/adb/$domain
  mkdir -p $installDir
}

###
echo "$name $version ($versionCode)
Copyright 2017-2024, $author
GPLv3+

Installing in $installDir/$id/..."

# Print detected root framework
if $KSU; then
  echo "Root framework: KernelSU"
elif $APATCH; then
  echo "Root framework: APatch / FolkPatch"
elif $magisk; then
  echo "Root framework: Magisk"
else
  echo "Root framework: Unknown/Standalone"
fi

# backup
rm -rf $data_dir/backup 2>/dev/null || :
mkdir -p $data_dir/backup
cp -aH /data/adb/$domain/$id/* $config $data_dir/backup/ 2>/dev/null || :

/system/bin/sh $srcDir/install/uninstall.sh install

mkdir -p $installDir/$id
cp -R $srcDir/install/* $installDir/$id/
installDir=$(readlink -f $installDir/$id)

cp $srcDir/module.prop $installDir/
cp -f $srcDir/README.* $data_dir/
# also keep a copy in the module dir so the WebUI Open Manual button finds it
cp -f $srcDir/README.md $installDir/ 2>/dev/null || :

# KaiOS patches
[ ! -d /data/usbmsc_mnt/ ] || {
  for i in $installDir/$id/*.sh; do
    sed -Ei 's#/sdcard(/|/Download/)#/data/usbmsc_mnt/#g' $i
  done
}

tmpd=/dev/.$domain/$id
mkdir -p $tmpd

###
if $acca; then
  if $KSU || $APATCH || $magisk; then
    ln -fs $installDir $accaFiles/
    # AccA post-uninstall cleanup script
    mkdir -p /data/adb/service.d || {
      rm /data/adb/service.d
      mkdir /data/adb/service.d
    }
    echo "#!/system/bin/sh
# acc front-end post-uninstall cleanup script
until test -d /sdcard/Android \\
  && test .\$(getprop sys.boot_completed) = .1
do
  sleep 60
done
sleep 60
[ -e $accaFiles/$id ] || rm -rf \$0 /data/adb/$domain/$id /data/adb/modules/$id 2>/dev/null
exit 0" | sed 's/^ //' > /data/adb/service.d/${id}-cleanup.sh
    chmod 0755 /data/adb/service.d/${id}-cleanup.sh
  fi
fi

[ $installDir = /data/adb/$domain/$id ] || {
  mkdir -p /data/adb/$domain
  ln -sf $installDir /data/adb/$domain/
}

###
# system/bin wrappers: only needed for Magisk (bind-mount of /system/bin works reliably).
# For KSU and APatch/FolkPatch, OverlayFS mount of system/bin during early boot causes deadlocks.
# Instead, symlink acc executables to /data/adb/vr25/bin/ (already in PATH via setup-busybox).
if $magisk && ! $KSU && ! $APATCH; then
  mkdir -p $installDir/system/bin
  for i in ${id}.sh:$id ${id}.sh:${id}d, ${id}.sh:${id}d. ${id}a.sh:${id}a service.sh:${id}d; do
    j=$installDir/system/bin/${i#*:}
    [ ! -h $j ] || rm $j
    echo "#!/system/bin/sh
#exec_wrapper
if [ -f $tmpd/.updated ]; then
  exec /dev/${i#*:} \"\$@\"
else
  exec /system/bin/sh /data/adb/$domain/$id/${i%:*} \"\$@\"
fi" > $j
    chmod 0755 $j
  done
else
  # KSU / APatch / FolkPatch: skip system/bin mount to avoid OverlayFS boot deadlock.
  # Symlink acc executables into both /data/adb/vr25/bin and /data/adb/ap/bin
  # (ap/bin is in PATH for APatch/FolkPatch; vr25/bin is added by setup-busybox.sh for KSU).
  touch $installDir/skip_mount
  mkdir -p /data/adb/vr25/bin
  for i in ${id}.sh:$id ${id}.sh:${id}d, ${id}.sh:${id}d. ${id}a.sh:${id}a service.sh:${id}d; do
    ln -sf /data/adb/$domain/$id/${i%:*} /data/adb/vr25/bin/${i#*:}
    chmod 0755 /data/adb/vr25/bin/${i#*:}
    # also link into ap/bin if it exists (APatch/FolkPatch)
    [ -d /data/adb/ap/bin ] && ln -sf /data/adb/$domain/$id/${i%:*} /data/adb/ap/bin/${i#*:} || :
  done
fi


# install binaries
cp -f $srcDir/bin/${id}_flashable_uninstaller.zip $data_dir/

# Termux, fix shebang
termux=false
case "$installDir" in
  */com.termux*)
    termux=true
    for f in $installDir/*.sh; do
      ! grep -q '^#\!/.*/sh' $f \
        || sed -i 's|^#!/.*/sh|#!/data/data/com.termux/files/usr/bin/bash|' $f
    done
    ;;
esac

# set perms
case $installDir in
  /data/data/*|/data/user/*)
    set_perms_recursive $installDir $(stat -c %u ${installDir%/$id})
    # Termux:Boot
    ! $termux || {
      mkdir -p ${installDir%/*}/.termux/boot
      ln -sf $installDir/service.sh ${installDir%/*}/.termux/boot/${id}-init.sh
      chown -R $(stat -c %u:%g /data/data/com.termux) ${installDir%/*}/.termux
      /system/bin/restorecon -R ${installDir%/*}/.termux > /dev/null 2>&1 || :
    }
    ;;
  *)
    set_perms_recursive $installDir
    chmod 0755 $installDir/system/bin/* 2>/dev/null || :
    ;;
esac

# APatch / FolkPatch: copy module to _update directory (same as KSU behavior)
if $KSU || $APATCH; then
  upModDir=${magiskModDir}_update
  rm -rf $upModDir/$id 2>/dev/null || :
  cp -a $installDir $upModDir/ 2>/dev/null || :
  touch $installDir/update
fi

set +eu

printf "Done\n\n\n"

# print links and changelog
sed -En "\|^## LINKS|,\$p" $srcDir/README.md \
  | grep -v '^---' | sed 's/^## //'

printf "\n\nCHANGELOG\n\n"
cat $srcDir/changelog.md

_echo() {
  echo "$@" | tee -a $tmpd/.install-notes
}

printf "\n\n"
printf "$version ($versionCode) installed and running!\n\nRollback with acc -b if not satisfied.\n\n" | tee $tmpd/.install-notes

if [ -x /sbin/${id}d ] || grep -q '#exec_wrapper' /system/bin/${id}d 2>/dev/null; then
  _echo "Rebooting is unnecessary."
else
  _echo "Note: If you're not rebooting now, prefix all acc executables with /dev/ (as in /dev/acc -i, /dev/accd). Reasoning: Magisk, KernelSU, APatch and FolkPatch don't [re]mount/update modules without a reboot."
fi

case $installDir in
  /data/adb/modules*) ;;
  *) $KSU || $APATCH || echo "
Non-Magisk/KSU/APatch users can enable $id auto-start by running /data/adb/$domain/$id/service.sh, a copy of, or a link to it - with init.d or an app that emulates it.";;
esac

# initialize $id (run in background to avoid blocking the installer UI)
rm $data_dir/disable 2>/dev/null
/data/adb/$domain/$id/service.sh --init &

ui_print ""
ui_print "- $name"
ui_print "- $version ($versionCode)"
ui_print "- Installation complete!"
ui_print ""

# magic_overlayfs support
OVERLAY_IMAGE_EXTRA=0     # number of kb need to be added to overlay.img
OVERLAY_IMAGE_SHRINK=true # shrink overlay.img or not?

# only use OverlayFS if Magisk_OverlayFS is installed
if [ -f "/data/adb/modules/magisk_overlayfs/util_functions.sh" ] && \
   /data/adb/modules/magisk_overlayfs/overlayfs_system --test; then
  ui_print ""
  ui_print "- Add support for overlayfs"
  . /data/adb/modules/magisk_overlayfs/util_functions.sh
  support_overlayfs && rm -rf "$MODPATH"/system
fi

exit 0
