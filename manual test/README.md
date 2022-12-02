curl can be used to send a raw command to the speakers, assuming nothing else is connected to the speaker's socket

curl example to turn the speakers off (in a terminal window), OFF references the OFF file in this folder in the repository:

```cat OFF | curl telnet://192.168.1.170:50001```

```cat FILE_NAME | curl telnet://SPEAKER_IP:50001``` 

I don't expect anything bad to happen, but use at your own risk
