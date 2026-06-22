#!/system/bin/sh
# $id initializer
# Copyright 2017-2021, VR25
# License: GPLv3+

id=acc
domain=vr25
TMPDIR=/dev/.$domain/$id
execDir=/data/adb/$domain/$id
dataDir=/data/adb/$domain/${id}-data

[ -f $execDir/disable -o -f $dataDir/disable ] && exit 14

# wait til the lock screen is ready and give some bootloop grace period
slept=false
until [ .$(getprop init.svc.bootanim 2>/dev/null) = .stopped ]; do
  [ -f $execDir/disable -o -f $dataDir/disable ] && exit 14
  sleep 10 && slept=true
done
$slept && sleep 60
unset slept

mkdir -p $TMPDIR $dataDir
export dataDir domain execDir id TMPDIR

# Apply saved update channel preference (set via WebUI).
# Module updates overwrite module.prop, so re-apply the chosen channel's updateJson on every boot.
if [ -f $dataDir/update-channel ]; then
  _chan=$(cat $dataDir/update-channel 2>/dev/null)
  case "$_chan" in
    beta) _json=module-beta.json ;;
    *)    _json=module.json ;;
  esac
  _url="https://raw.githubusercontent.com/kgursu/acc-webui-kernelsu/dev/$_json"
  for _p in /data/adb/modules/$id/module.prop /data/adb/$domain/$id/module.prop; do
    [ -f "$_p" ] && sed -i "s|^updateJson=.*|updateJson=$_url|" "$_p" 2>/dev/null || :
  done
  unset _chan _json _url _p
fi

. $execDir/setup-busybox.sh
. $execDir/release-lock.sh
[ ".$1" = .-x ] && touch $dataDir/disable
exec start-stop-daemon -bx $execDir/${id}d.sh -S -- "$@" || exit 12
