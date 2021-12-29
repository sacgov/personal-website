---
title: LZW Compression
layout: post
hidden: true
---

### LZ Compression Algorithms
Lempel–Ziv–Welch (LZW) Compression algorithms are loseless. This means that we have zero data loss on compression. On decompression the data exactly matches with original source.

#### LZ77

We are given an input of characters. We decide on a dictionary size and a lookahead buffer size.

A pseudocode for the encoding with **LZ77**.

* Let D the length of the dictionary and B the length of the buﬀer.(This means the we can look back till length D. The string we search will be of max length B.)
* Input the ﬁrst B symbols in the buﬀer.
* While the input is not exhausted:
    1.  Let d the position in the dictionary of the ﬁrst b symbols of the buﬀer and c the symbol that makes that b can not be larger.
    2. Output <d,b,c>.
    3. Input the next b + 1 characters to the buﬀer.

I know it's a bit confusing. 
abr|acada|brad => Let's consider this case below. We search for "acada". We do not find it. We search for "acad". We do not find it either. We search for "aca","ac". We finally "a" which is 3 chars backward and we need to read 1 char. we also output the next char 'c' leaving us with <3,1,c>.

abrac|adabr|ad => In this case, we match "a" at both 2 chars back and 5 chars back. We choose the least one which is 2 chars back. <2,1,d>

abracad|abrad|  <7,4,d> We stop at "abra" as soon as it matches at 7 chars back.

*Please note that the above explanation is for illustrating purposes only. We do not search separately for each string. In a single iteration we take a greedy approach and find the largest subtring we can match by iterating one character back each time.*

Dictionary size is 7 and buffer size is 5.

The structure is Dictionary|Buffer| Remaining Stream.

Lets use the string "abracadabrad". The characters in dictionary is 0 initially.

|abrac|adabrad  <0,0,a>  //Dictionary size is 0, we output a the next character

a|braca|dabrad  <0,0,b>  // move one pointer forward. output b

ab|racad|abrad  <0,0,r>  //output r similarly.

abr|acadabr|ad  <3,1,c> // finally we see some progess.A here matches a character three steps backward. 1 represents the length to copy after moving 3 steps backward.

abrac|adabr|ad  <2,1,d> //though a repeats 2 times we choose the first occurence when we keep going back ward.

abracad|abrad|  <7,4,d> // here we see a significant benefit. We can go back seven characters and get 4 characters _abra_ so 7 steps back and 4 steps forward is copied.

abracadabrad|| //algorithm finishes here.

There are some other variation to the **LZ77** algorithm. Changing the decoder to it is trivial. 
Some of the variants include 
abrac|adabr|ad <0,1,d> here 0 is the index to start and read 1 char.
Here instead of going back we start from the 0th index of the dictionary.

A more important variant would be the one with run-length encoding.
Where we loop in the input till we get to the desired length.
baac|aacaabc|abaaac  <3,5,b>
We go back 3 chars but copy 5chars. How is it even possible. By looping over the input. We go back 3 chars and start read but when we reach end of input we start again from our start (3 chars back). "aac" + "aa"(from the start)
baacaacaab|caba|aac <1,2,c> go 1 char back and we loop 2 times and get "aa".

A pseudocode for the decoding with **LZ77**.

Init buffer => ""
CurrentIndex => 0
for every tuple <i,j,c>
    * Move the pointer

<0,0,a>  => a
<0,0,b>  => ab
<0,0,r>  => abr
<3,1,c>  => abr + (3 chars back gives us the position at a and we read one character) + 'c' => abr + a + c => abrac 
<2,1,d> abrac + (2 chars back gives us the position at a and we read one character) + 'd' => abrac + a + d => abracad 
<7,4,d> abracad + (7 chars back gives us the position at a and we read four character) + 'd' => abracad + abra + d => abracadabrad.









