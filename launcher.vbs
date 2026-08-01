' 一叶轻舟工作室 — 静默启动器
' 隐藏命令行窗口，在后台启动 Node.js
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' 获取本脚本所在目录，设为工作目录
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

' 以隐藏窗口方式启动 node.exe
shell.Run """" & scriptDir & "\node.exe"" """ & scriptDir & "\launcher.js""", 0, False
