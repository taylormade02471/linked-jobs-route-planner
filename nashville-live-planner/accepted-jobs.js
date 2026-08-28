(function loadCurrentAcceptedJobs(root) {
  const dueAug28At6 = 'Friday, August 28, 2026 at 6:00 PM';
  const dueAug28At730 = 'Friday, August 28, 2026 at 7:30 PM';
  const dueAug28At11 = 'Friday, August 28, 2026 at 11:00 PM';
  const tobacco = (store, address, due = dueAug28At6) => ({
    name: 'Tobacco Products Photo Audit',
    title: 'Tobacco Products Photo Audit',
    location_name: `Dollar General (Store #${store})`,
    address,
    minutes: 15,
    pay_cents: 825,
    due,
    provider_id: 'survey_merchandiser',
    provider_label: 'Survey Merchandiser',
    status: 'needs_completion',
    requirements: 'Accepted assignment shown in My Assignments; complete photo audit before deadline.',
  });
  const bodyButter = (store, address) => ({
    name: 'Body Butter Product Audit & Sampling',
    title: 'Body Butter Product Audit & Sampling',
    location_name: `Dollar General (Store #${store})`,
    address,
    minutes: 30,
    pay_cents: 1090,
    due: dueAug28At730,
    provider_id: 'survey_merchandiser',
    provider_label: 'Survey Merchandiser',
    status: 'needs_completion',
    requirements: 'Accepted assignment shown in My Assignments; complete audit and sampling before deadline.',
  });

  const jobs = {
    NEW01: bodyButter('325', '2105 Trenton Rd, Clarksville, TN 37040'),
    NEW02: bodyButter('9805', '1945 Madison St, Clarksville, TN 37043'),
    NEW03: bodyButter('6159', '3855 Trenton Rd, Clarksville, TN 37040'),
    NEW04: tobacco('4400', '3721 Clarksville Hwy, Nashville, TN 37218'),
    NEW05: tobacco('2443', '3852 Dickerson Pike, Nashville, TN 37207'),
    NEW06: tobacco('6742', '2434 Whites Creek Pike, Nashville, TN 37207', dueAug28At11),
    NEW07: tobacco('2627', '3049 Dickerson Pike, Nashville, TN 37207', dueAug28At11),
    NEW08: tobacco('9232', '3019 Dickerson Pike, Nashville, TN 37207'),
    NEW09: tobacco('8347', '601 Gallatin Pike N, Madison, TN 37115'),
    NEW10: tobacco('2392', '808 Madison Sq, Madison, TN 37115'),
    NEW11: tobacco('7914', '459 Myatt Dr, Madison, TN 37115'),
    NEW12: tobacco('9821', '301 E Thompson Ln, Nashville, TN 37211'),
    NEW13: tobacco('2360', '3926 Lebanon Pike, Hermitage, TN 37076'),
    NEW14: tobacco('9822', '4491 Lebanon Pike, Hermitage, TN 37076'),
    NEW15: tobacco('1901', '13820 Lebanon Rd, Old Hickory, TN 37138'),
    NEW16: tobacco('9802', '5445 Nolensville Rd, Nashville, TN 37211'),
    NEW17: tobacco('1990', '2275 Murfreesboro Pike, Nashville, TN 37217'),
    NEW18: {
      ...tobacco('1033', '1015 Jefferson St, Nashville, TN 37208, Saturday, August 29, 2026 at 11:45 PM'),
      pay_cents: 650,
      status: 'assigned',
      requirements: 'Ready to Start assignment shown in My Assignments.',
    },
  };

  root.PLANNER_DATA.jobs = jobs;
  root.PLANNER_DATA.serviceDate = '2026-08-28';
})(window);
