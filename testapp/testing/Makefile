OBJS = beaglelogic_changeStateTest.o beaglelogic.o seniorDesign.o 
CC = gcc
DEBUG = -g
CFLAGS = -c -pthread $(DEBUG)
LFLAGS = -pthread -lpaho-mqtt3c $(DEBUG)

testAPP : $(OBJS)
	$(CC) $(LFLAGS) $(OBJS) -o testAPP

beaglelogic_chageStateTest.o : ../seniorDesign/seniorDesignLib.h ../libbeaglelogic.h beaglelogic_changeStateTest.c 
	$(CC) $(CFLAGS) beaglelogic_changeStateTest.c

beaglelogic.o : ../libbeaglelogic.h ../beaglelogic.c
	$(CC) $(CFLAGS) ../beaglelogic.c 

seniorDesign.o : ../seniorDesign/seniorDesignLib.h ../seniorDesign/seniorDesign.c
	$(CC) -L/home/debian/paho.mqtt.c/build/output $(CFLAGS) -lpaho-mqtt3c ../seniorDesign/seniorDesign.c
clean:
	\rm *.o *~ seniorDesignAPP

