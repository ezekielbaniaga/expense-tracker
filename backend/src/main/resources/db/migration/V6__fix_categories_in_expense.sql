-- Fixed my error with enumeration type. The Expense class is now using @EnumType.STRING
UPDATE expense SET category='FOOD' WHERE category = '0';
UPDATE expense SET category='TRANSPORT' WHERE category = '1';
UPDATE expense SET category='BILLS' WHERE category = '2';
UPDATE expense SET category='ENTERTAINMENT' WHERE category = '3';
