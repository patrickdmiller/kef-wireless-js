curl can be used to send a raw command to the speakers, assuming nothing else is connected to the speaker's socket

curl example to turn the speakers off:

```cat OFF | curl telnet://192.168.1.170:50001```