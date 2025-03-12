defaultpen(fontsize (10pt));
usepackage("amsmath");
usepackage("amssymb");
settings.tex="latex";
settings.outformat="pdf";
size (15cm);


real s = 2;
void sq(real x, real y) {
	if(x < 29.5) return;
	filldraw((x, y)--(x+s, y)--(x+s, y+s)--(x, y+s)--cycle, red);
	draw((x+s/2, y)--(x+s/2, y+s), linetype(new real[] {2, 2}));
	draw((x, y+s/2)--(x+s, y+s/2), linetype(new real[] {2, 2}));
}


//10, 40, 25, 14, 1



//10
sq(2.5, 0);
sq(4.6, 0);
sq(6.1, 0);
sq(7.6, 0);
sq(9, 0);
sq(8.5, s);
sq(7, 1);
sq(5.6, s);
sq(7.7, 2*s);
sq(9.3, 2*s);


//// 40
//9
sq(10.1, 0);
sq(11.2, 0);
sq(12.3, 0);
sq(13.4, 0);
sq(14.5, 0);
sq(15.6, 0);
sq(16.7, 0);
sq(17.8, 0);
sq(18.9, 0);
//8
sq(9.8, s);
sq(11, s);
sq(12.2, s);
sq(13.5, s);
sq(14.8, s);
sq(16.1, s);
sq(17.4, s);
sq(18.7, s);
//7
sq(11.3, 2*s);
sq(12.8, 2*s);
sq(14.25, 2*s);
sq(15.5, 2*s);
sq(16.75, 2*s);
sq(18, 2*s);
sq(19.25, 2*s);
//6
sq(12.1, 3*s);
sq(13.45, 3*s);
sq(14.7, 3*s);
sq(15.95, 3*s);
sq(17.2, 3*s);
sq(18.45, 3*s);
//4
sq(15.3, 4*s);
sq(16.7, 4*s);
sq(18, 4*s);
sq(19.3, 4*s);
//3
sq(16, 5*s);
sq(17.3, 5*s);
sq(18.6, 5*s);
//2
sq(17.9, 6*s);
sq(19.2, 6*s);
//1
sq(18.5, 7*s);



//8
sq(20.1, 0);
sq(21.25, 0);
sq(22.4, 0);
sq(23.55, 0);
sq(24.7, 0);
sq(26.1, 0);
sq(27.5, 0);
sq(28.9, 0);
//7
sq(19.9, s);
sq(21.1, s);
sq(22.3, s);
sq(23.6, s);
sq(25.1, s);
sq(26.5, s);
sq(28.2, s);
//6
sq(20.5, 2*s);
sq(21.7, 2*s);
sq(22.9, 2*s);
sq(24.1, 2*s);
sq(25.6, 2*s);
sq(27.3, 2*s);
//2
sq(20, 3*s);
sq(21.3, 3*s);
//1
sq(20.7, 4*s);
//1
sq(20, 5*s);


//4
sq(30.2, 0);
sq(32.4, 0);
sq(34.6, 0);
sq(36.9, 0);

//4
sq(29.7, s);
sq(32, s);
sq(34.3, s);
sq(36.6, s);

//3
sq(30.2, 2*s);
sq(33, 2*s);
sq(35.5, 2*s);

//2
sq(31.5, 3*s);
sq(34.5, 3*s);

//1
sq(42, 0);




sq(55.25, 0);
sq(57.75, 0);
sq(60.25, 0);
sq(62.75, 0);

sq(56.5, s);
sq(59, s);
sq(61.5, s);

sq(57.75, 2*s);
sq(60.25, 2*s);

sq(59, 3*s);



real h = 1;
real sp = 1.2;

real x1 = 55;
real x2 = 65;
real y1 = 0;
real y2 = 0;

draw((x1, y1)--(x2, y1)--(x2, y2)--(x1, y2)--cycle);

label("Ei saavu", ((x1+x2)/2, -sp));




pair TEN = (20, 0);
pair BEG = (0, 0);
pair END = (50, 0);





draw(BEG--END);



for(int k = 0; k <= 50; k += 10) {
	if(k == 0 || k == 50) {
		draw((k, h)--(k, -h), black);
	} else {
		draw((k, 0)--(k, -h), black);
	}
	
	if(k == 0) {
		label("9:40", (k, -h-sp));
	}
	if(k == 10) {
		label("9:50", (k, -h-sp));
	}
	if(k == 20) {
		label("10:00", (k, -h-sp));
	}
	if(k == 30) {
		label("10:10", (k, -h-sp));
	}
	if(k == 40) {
		label("10:20", (k, -h-sp));
	}
	if(k == 50) {
		label("10:30", (k, -h-sp));
	}
}



















